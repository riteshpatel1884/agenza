import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
import certifi

from key_pool import KeyPool, looks_like_rate_limit

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from typing import Annotated

from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool, InjectedToolArg
from langgraph.graph import StateGraph, START, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.config import get_stream_writer
from psycopg_pool import ConnectionPool

from email_utils import send_smtp_email
from jobs import search_adzuna_jobs, JobSearchError

Path("data").mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Conversation memory now lives in the same Neon Postgres database as
# everything else (see database.py), via LangGraph's Postgres checkpointer.
# A single connection pool is shared by every model's compiled graph.
# ---------------------------------------------------------------------------

_RAW_DATABASE_URL = os.environ["DATABASE_URL"]  # plain "postgresql://" — psycopg wants no "+driver" suffix

_pool = ConnectionPool(
    conninfo=_RAW_DATABASE_URL,
    max_size=10,
    kwargs={"autocommit": True, "prepare_threshold": 0},
)

_checkpointer = PostgresSaver(_pool)
_checkpointer_ready = False


def _get_checkpointer():
    """Create the checkpointer's tables on first use (idempotent), then reuse the same pool-backed instance."""
    global _checkpointer_ready
    if not _checkpointer_ready:
        _checkpointer.setup()
        _checkpointer_ready = True
    return _checkpointer


# ---------------------------------------------------------------------------
# Model + key registry — built entirely from your .env file. There is no
# user-facing model picker anymore: the backend automatically works through
# every model/key combination you've configured, in order, and falls back
# silently the moment one of them looks rate-limited or errors out.
#
# For each provider, list the models as numbered env vars, and give the
# provider one or more keys — a single <PREFIX>_API_KEY, or several numbered
# ones (<PREFIX>_API_KEY_1, _2, _3, ...) if you have multiple accounts you
# want to rotate across automatically:
#
#   GROQ_API_KEY_1=gsk_...
#   GROQ_API_KEY_2=gsk_...
#   GROQ_API_KEY_3=gsk_...
#   GROQ_MODEL_1=openai/gpt-oss-120b
#   GROQ_MODEL_2=openai/gpt-oss-20b
#
#   GEMINI_API_KEY=...
#   GEMINI_MODEL_1=gemini-2.5-flash
#
#   MISTRAL_API_KEY=...
#   MISTRAL_MODEL_1=mistral-large-latest
#
# A model only shows up if both its *_MODEL_N var and at least one key for
# that provider are set. Priority (which combo is tried first) follows the
# order providers are declared below, then the numeric suffix of *_MODEL_N,
# then the declared order of that provider's keys.
# ---------------------------------------------------------------------------

PROVIDERS = {
    "groq": {"env_prefix": "GROQ", "label": "Groq"},
    "gemini": {"env_prefix": "GEMINI", "label": "Gemini"},
    "mistral": {"env_prefix": "MISTRAL", "label": "Mistral"},
}

_MODEL_VAR_PATTERN = re.compile(r"^([A-Z]+)_MODEL_(\d+)$")


def _discover_keys(env_prefix: str) -> list[str]:
    """
    Collect every key configured for a provider: a plain <PREFIX>_API_KEY
    plus any <PREFIX>_API_KEY_1, _2, _3, ... — as many as your .env defines.
    Order is preserved, since it doubles as fallback priority.
    """
    keys = []

    single = os.getenv(f"{env_prefix}_API_KEY")
    if single and single.strip():
        keys.append(single.strip())

    index = 1
    while True:
        value = os.getenv(f"{env_prefix}_API_KEY_{index}")
        if value is None:
            break
        if value.strip():
            keys.append(value.strip())
        index += 1

    return keys


PROVIDER_KEY_POOLS = {
    name: KeyPool(_discover_keys(info["env_prefix"])) for name, info in PROVIDERS.items()
}


def _discover_models():
    """
    Scan environment variables for <PREFIX>_MODEL_<N> entries and build the
    registry: { model_id: {provider, model, label} }. Key material lives
    separately in PROVIDER_KEY_POOLS, since one model can be paired with
    several keys.
    """
    prefix_to_provider = {info["env_prefix"]: name for name, info in PROVIDERS.items()}

    found = []  # (provider, index, model_name)

    for env_key, env_value in os.environ.items():
        match = _MODEL_VAR_PATTERN.match(env_key)
        if not match or not env_value.strip():
            continue

        prefix, index = match.groups()
        provider = prefix_to_provider.get(prefix)
        if not provider:
            continue

        found.append((provider, int(index), env_value.strip()))

    # Stable order: group by provider (in the order declared in PROVIDERS),
    # then by the numeric suffix (_1, _2, _3, ...).
    provider_order = {name: i for i, name in enumerate(PROVIDERS)}
    found.sort(key=lambda item: (provider_order[item[0]], item[1]))

    registry = {}

    for provider, index, model_name in found:
        if not PROVIDER_KEY_POOLS[provider]:
            # Model listed but no key for its provider yet — skip it rather
            # than exposing a model that will just error out.
            continue

        model_id = f"{provider}-{index}"

        registry[model_id] = {
            "provider": provider,
            "model": model_name,
            "label": f"{PROVIDERS[provider]['label']} · {model_name}",
        }

    return registry


MODEL_REGISTRY = _discover_models()


# ---------------------------------------------------------------------------
# Email tool — lets the agent send an email on the user's behalf when asked.
#
# SMTP credentials come from whoever is chatting, entered through the
# Settings modal in the UI and stored per-user in the database (see
# database.py: EmailSettings). They're threaded in per-request via the
# LangGraph run config rather than hardcoded here, so every user can connect
# their own inbox instead of sharing one account from a .env file.
#
# SMTP_HOST/USER/PASSWORD env vars below are only a fallback for a
# single-tenant deployment where nobody has entered their own settings yet.
# ---------------------------------------------------------------------------

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "agenza.ai")

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@tool
def send_email(
    to: str,
    subject: str,
    body: str,
    cc: str | None = None,
    config: Annotated[RunnableConfig, InjectedToolArg] = None,
) -> str:
    """Send an email on the user's behalf.

    Use this whenever the user asks you to email, message, or notify someone
    by email. Send it directly — the user's request IS the confirmation, so
    don't ask "should I send this?" first. Do make sure the recipient
    address, subject, and body you pass in match exactly what the user
    asked for; never invent a recipient or content they didn't give you.

    Args:
        to: The recipient's email address.
        subject: The email subject line.
        body: The plain-text body of the email.
        cc: Optional comma-separated list of additional recipients to cc.
    """
    smtp = ((config or {}).get("configurable") or {}).get("smtp") or {}
    host = smtp.get("host") or SMTP_HOST
    port = smtp.get("port") or SMTP_PORT
    user = smtp.get("user") or SMTP_USER
    password = smtp.get("password") or SMTP_PASSWORD
    from_name = smtp.get("from_name") or SMTP_FROM_NAME

    if not host or not user or not password:
        return (
            "Email isn't connected yet. Ask the user to add their SMTP "
            "details in Settings -> Email before you can send on their behalf."
        )

    if not _EMAIL_PATTERN.match(to.strip()):
        return f"'{to}' doesn't look like a valid email address — please confirm it with the user."

    ok, message = send_smtp_email(host, port, user, password, from_name, to, subject, body, cc)
    return message


# ---------------------------------------------------------------------------
# Job search tool — lets the agent pull live job listings from Adzuna,
# scoped to whatever the signed-in user saved in Settings -> Job Search.
#
# Per-user preferences (role, location, day range, min salary, etc.) are
# threaded in via the run config, same as the SMTP settings above, so the
# model doesn't need the user to restate them in the chat.
#
# IMPORTANT: the full job list is emitted directly to the frontend via
# get_stream_writer() (a "custom" stream event app.py forwards as-is) rather
# than being returned as this tool's result. A tool's return value becomes a
# ToolMessage that's permanently stored in the conversation's checkpointed
# history — if that message contained the full job list (with long
# descriptions), every future turn in the same chat would re-send that
# entire payload back to the model, growing the prompt each time you search
# again until it blows past the provider's token-per-minute limit. Returning
# a short summary instead keeps conversation memory small no matter how many
# searches happen in one chat.
# ---------------------------------------------------------------------------

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY")

_DEFAULT_JOB_COUNT = 10
_MAX_JOB_COUNT = 50


@tool
def search_jobs(
    role: str | None = None,
    location: str | None = None,
    max_days_old: int | None = None,
    count: int | None = None,
    config: Annotated[RunnableConfig, InjectedToolArg] = None,
) -> str:
    """Search for current job listings and show them to the user.

    Call this whenever the user asks to see, find, or check jobs/openings —
    e.g. "show me jobs", "find backend developer roles", "give me 3 jobs
    related to SDE", "anything new in the last 2 days". The user's saved Job
    Search preferences (role, location, country, day range, salary floor,
    job type, excluded keywords) are applied automatically — you do NOT
    need to ask the user for these before calling the tool. Only pass
    `role`, `location`, or `max_days_old` yourself if the user's message
    explicitly names a different role, place, or day range than what
    they'd normally have saved; otherwise leave them as None and the saved
    preferences are used as-is.

    IMPORTANT — count: if the user's message asks for a specific number of
    jobs (e.g. "give me 3 jobs", "show me 5 openings", "just 1 is fine"),
    you MUST pass that exact number as `count`. If they didn't mention a
    number, leave `count` as None and their saved default is used.

    The listings themselves are already shown to the user as cards in the
    UI — do not re-list, re-describe, or repeat any job's title, company,
    or description back in your reply, since the full data isn't even
    visible to you. Just give a short one-line summary (how many were
    found and for what), and only answer a follow-up question about a
    specific listing if the user asks one directly.

    Args:
        role: Optional override for the job title/keywords to search.
        location: Optional override for the city/region ("Remote" is fine).
        max_days_old: Optional override for how many days back to search.
        count: Optional override for how many listings to return, taken
            directly from a number the user mentioned.
    """
    prefs = ((config or {}).get("configurable") or {}).get("job_preferences") or {}

    effective_role = (role or prefs.get("role") or "").strip()
    if not effective_role:
        return (
            "No role to search for. Ask the user to either tell you what "
            "role/keywords to search, or save a role in Settings -> Job Search."
        )

    effective_location = (location if location is not None else prefs.get("location")) or ""
    if prefs.get("remote_only") and not effective_location:
        effective_location = "Remote"

    effective_days = max_days_old or prefs.get("max_days_old") or 3

    requested_count = count or prefs.get("results_per_page") or _DEFAULT_JOB_COUNT
    requested_count = max(1, min(int(requested_count), _MAX_JOB_COUNT))

    job_type = prefs.get("job_type") if prefs.get("job_type") not in (None, "any") else None

    try:
        jobs, total_count = search_adzuna_jobs(
            app_id=ADZUNA_APP_ID,
            app_key=ADZUNA_APP_KEY,
            what=effective_role,
            where=effective_location,
            country=prefs.get("country") or "in",
            results_per_page=requested_count,
            max_days_old=effective_days,
            min_salary=prefs.get("min_salary"),
            job_type=job_type,
            what_exclude=prefs.get("keywords_exclude"),
        )
    except JobSearchError as e:
        return str(e)

    # Adzuna's page size is a maximum, not a guarantee — trim defensively in
    # case it ever returns more than what was actually asked for.
    jobs = jobs[:requested_count]

    writer = get_stream_writer()
    writer({"type": "jobs", "jobs": jobs, "count": total_count})

    where_note = f" in {effective_location}" if effective_location else ""
    return (
        f"Found {total_count} job(s) matching '{effective_role}'{where_note}; "
        f"showing {len(jobs)} to the user."
    )


# ---------------------------------------------------------------------------
# Web search tool — lets the agent look up current, real-world information
# (news, prices, "what's happening with X today", anything past its training
# data) via Tavily. Same rotation pattern as the LLM providers: give it one
# or more keys as TAVILY_API_KEY_1, _2, _3, ... in .env, and it automatically
# moves to the next key the moment one comes back rate-limited.
# ---------------------------------------------------------------------------

TAVILY_KEY_POOL = KeyPool(_discover_keys("TAVILY"))
_DEFAULT_SEARCH_RESULTS = 5
_MAX_SEARCH_RESULTS = 10


@tool
def web_search(query: str, max_results: int | None = None) -> str:
    """Search the live web for current, real-world information.

    Use this whenever the user asks about something that could have
    changed or that you can't be confident about from memory alone —
    current events, news, prices, scores, "what's the latest on...",
    people/companies/products you're unsure about, or anything time-
    sensitive. Don't use it for general knowledge, definitions, or things
    you already know confidently.

    Args:
        query: A short, specific search query (a few words works best).
        max_results: Optional number of results to return (default 5, max 10).
    """
    if not TAVILY_KEY_POOL:
        return "Web search isn't configured yet — add TAVILY_API_KEY_1 (and optionally more) to the .env file."

    query = (query or "").strip()
    if not query:
        return "A search query is required."

    count = max(1, min(int(max_results or _DEFAULT_SEARCH_RESULTS), _MAX_SEARCH_RESULTS))

    from tavily import TavilyClient

    last_error = None

    for key in TAVILY_KEY_POOL.ordered_keys():
        try:
            client = TavilyClient(api_key=key)
            response = client.search(query, max_results=count, search_depth="basic")
            results = response.get("results", [])

            if not results:
                return f"No web results found for '{query}'."

            lines = [f"Web search results for '{query}':"]
            for r in results:
                title = (r.get("title") or "").strip()
                url = r.get("url") or ""
                snippet = (r.get("content") or "").strip()[:400]
                lines.append(f"- {title} ({url}): {snippet}")

            return "\n".join(lines)

        except Exception as exc:
            last_error = exc
            if looks_like_rate_limit(exc):
                TAVILY_KEY_POOL.mark_limited(key)
            continue

    return f"Web search failed after trying all configured keys: {last_error}"


TOOLS = [send_email, search_jobs, web_search]


SYSTEM_PROMPT = """
You are a helpful AI assistant with access to tools. Answer clearly, concisely, and honestly.
If you are not sure about something, say so instead of guessing.

You have a send_email tool. When the user asks you to email, message, or
notify someone, call it directly instead of just drafting the text — their
request is the instruction to send it, so don't ask for confirmation first.
Always use the exact recipient, subject, and content the user gave you.
After sending, briefly confirm what you sent and to whom. If the tool
reports that email isn't connected, tell the user to add their email in
Settings -> Email.

You also have a search_jobs tool. When the user asks to see, find, or
check jobs/openings, call it directly — their saved Job Search preferences
are applied automatically, so don't ask them to repeat their role or
location first unless the tool tells you none is saved. If the user's
message names a specific number of jobs (e.g. "3 jobs", "just 2"), always
pass that number as the tool's `count` argument. The job listings
themselves are rendered to the user separately as cards, and you are not
given their contents back — keep your reply to a short one-line summary
rather than listing or describing the jobs yourself.

You also have a web_search tool for current, real-world information —
news, prices, recent events, or anything you can't confidently answer
from memory. Call it when the user's question depends on up-to-date
information, then answer using what it returns. Briefly mention that you
searched the web when you use it, and don't fabricate sources or figures
if the tool comes back empty — just say so.
"""


def _instantiate_chat_model(provider: str, model_name: str, api_key: str):
    """Instantiate the correct chat model client for a given provider/model/key.

    Provider SDKs are imported lazily so you only need the package for the
    provider(s) you actually configured in .env.
    """
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model_name, api_key=api_key, temperature=0.5, streaming=True
        )

    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=model_name, api_key=api_key, temperature=0.5, streaming=True
        )

    if provider == "mistral":
        from langchain_mistralai import ChatMistralAI

        return ChatMistralAI(
            model=model_name, api_key=api_key, temperature=0.5, streaming=True
        )

    raise ValueError(f"Unknown provider '{provider}'")


class FallbackChatModel:
    """
    Wraps every configured (model, key) combination and tries them in
    priority order, skipping whichever are currently on cooldown. The
    moment one call looks like a rate limit / quota error, that key is put
    on cooldown and the next candidate is tried immediately — the caller
    (the LangGraph node below) only ever sees a single successful response
    or, if literally every candidate failed, the last error.

    This is what makes "GROQ_API_KEY_1 hit its limit" invisible to the
    user: the very next candidate (GROQ_API_KEY_2, then _3, then another
    provider entirely) picks up the same request without an extra round
    trip from the frontend.
    """

    def __init__(self, candidates: list[dict]):
        if not candidates:
            raise ValueError(
                "No models configured. Add at least one <PROVIDER>_MODEL_1 and "
                "matching <PROVIDER>_API_KEY (or _API_KEY_1, _2, ...) to your .env file."
            )
        self._candidates = candidates

    def _ordered_candidates(self):
        now = time.time()
        ready, cooling = [], []
        for cand in self._candidates:
            available_at = PROVIDER_KEY_POOLS[cand["provider"]].available_at(cand["key"])
            (ready if available_at <= now else cooling).append((available_at, cand))
        cooling.sort(key=lambda pair: pair[0])
        return [cand for _, cand in ready] + [cand for _, cand in cooling]

    def invoke(self, messages, *args, **kwargs):
        last_exc = None

        for cand in self._ordered_candidates():
            try:
                return cand["llm"].invoke(messages, *args, **kwargs)
            except Exception as exc:
                last_exc = exc
                # Rotate away from this key on anything that looks like a
                # rate limit; also rotate (without a cooldown) on any other
                # error so a single bad candidate can't block the rest.
                if looks_like_rate_limit(exc):
                    PROVIDER_KEY_POOLS[cand["provider"]].mark_limited(cand["key"])
                logger_note = f"{cand['provider']}/{cand['model']} failed, trying next candidate: {exc}"
                print(logger_note)
                continue

        raise last_exc


def _build_fallback_candidates() -> list[dict]:
    """One entry per (model, key) combination, in priority order, each
    already bound to TOOLS so the LangGraph node can call it directly."""
    candidates = []

    for model_id, info in MODEL_REGISTRY.items():
        provider = info["provider"]
        model_name = info["model"]

        for key in PROVIDER_KEY_POOLS[provider].all_keys():
            llm = _instantiate_chat_model(provider, model_name, key).bind_tools(TOOLS)
            candidates.append(
                {"model_id": model_id, "provider": provider, "model": model_name, "key": key, "llm": llm}
            )

    return candidates


def build_agent():
    """
    Build a LangGraph app: a chatbot node backed by a fallback chain across
    every configured model+key, plus a tools node it can loop through.

    Flow: chatbot -> (has tool call?) -> tools -> chatbot -> ... -> END.
    `tools_condition` checks the latest AI message for tool_calls and routes
    to the "tools" node if present, or ends the turn otherwise. Conversation
    state is persisted per thread_id via the Postgres checkpointer, so the
    model keeps context (and knows what it already sent) across turns.

    Per-user data (like SMTP credentials for send_email) is NOT baked in
    here — it's read from the run's config at call time, so this same
    compiled graph is reused across every signed-in user.
    """
    llm = FallbackChatModel(_build_fallback_candidates())

    def chatbot_node(state: MessagesState):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
        response = llm.invoke(messages)
        return {"messages": [response]}

    workflow = StateGraph(MessagesState)
    workflow.add_node("chatbot", chatbot_node)
    workflow.add_node("tools", ToolNode(TOOLS))
    workflow.add_edge(START, "chatbot")
    workflow.add_conditional_edges("chatbot", tools_condition)
    workflow.add_edge("tools", "chatbot")

    return workflow.compile(checkpointer=_get_checkpointer())


_AGENT = None


def get_agent():
    """Return the single cached agent, building it (and its fallback chain) once.

    There's no per-user model choice anymore — every request automatically
    gets the best available model/key combination, with silent fallback.
    """
    global _AGENT
    if _AGENT is None:
        _AGENT = build_agent()
    return _AGENT