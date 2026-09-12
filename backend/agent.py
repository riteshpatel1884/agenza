import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
import certifi

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
# Model registry — built entirely from your .env file. Nothing here is
# hardcoded: add/remove/rename models by editing .env only.
#
# For each provider, list the models you want in the selector as numbered
# env vars, and set that provider's API key:
#
#   GEMINI_API_KEY=...
#   GEMINI_MODEL_1=gemini-2.5-flash
#   GEMINI_MODEL_2=gemini-2.5-pro
#
#   GROQ_API_KEY=...
#   GROQ_MODEL_1=openai/gpt-oss-120b
#   GROQ_MODEL_2=openai/gpt-oss-20b
#
#   MISTRAL_API_KEY=...
#   MISTRAL_MODEL_1=mistral-large-latest
#
# You can add as many *_MODEL_N entries per provider as you want (3, 4, 5...).
# A model only shows up if both its *_MODEL_N var and the provider's
# *_API_KEY are set.
# ---------------------------------------------------------------------------

PROVIDERS = {
    "gemini": {"env_prefix": "GEMINI", "label": "Gemini"},
    "groq": {"env_prefix": "GROQ", "label": "Groq"},
    "mistral": {"env_prefix": "MISTRAL", "label": "Mistral"},
}

_MODEL_VAR_PATTERN = re.compile(r"^([A-Z]+)_MODEL_(\d+)$")


def _discover_models():
    """
    Scan environment variables for <PREFIX>_MODEL_<N> entries and build the
    registry: { model_id: {provider, model, label, api_key} }.
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
        env_prefix = PROVIDERS[provider]["env_prefix"]
        api_key = os.getenv(f"{env_prefix}_API_KEY")

        if not api_key:
            # Model listed but no key for its provider yet — skip it rather
            # than exposing a model that will just error out.
            continue

        model_id = f"{provider}-{index}"

        registry[model_id] = {
            "provider": provider,
            "model": model_name,
            "label": f"{PROVIDERS[provider]['label']} · {model_name}",
            "api_key": api_key,
        }

    return registry


MODEL_REGISTRY = _discover_models()

# Optionally pin a default via DEFAULT_MODEL_ID=gemini-1 in .env.
# Otherwise, fall back to the first model discovered above.
DEFAULT_MODEL_ID = os.getenv("DEFAULT_MODEL_ID") or next(iter(MODEL_REGISTRY), None)


def normalize_model_id(model_id):
    """Fall back to the default model if the frontend sends something unknown."""
    if not model_id or model_id not in MODEL_REGISTRY:
        return DEFAULT_MODEL_ID
    return model_id


def list_models():
    """Used by the /models endpoint so the frontend can populate the selector."""
    return [
        {"id": model_id, "label": info["label"], "provider": info["provider"]}
        for model_id, info in MODEL_REGISTRY.items()
    ]


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
# model doesn't need the user to restate them in the chat. The tool result
# is a JSON string; app.py detects it by tool name and forwards it to the
# frontend as a dedicated "jobs" SSE event so it renders as job cards
# instead of being retyped by the model as plain text.
# ---------------------------------------------------------------------------

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY")


@tool
def search_jobs(
    role: str | None = None,
    location: str | None = None,
    max_days_old: int | None = None,
    config: Annotated[RunnableConfig, InjectedToolArg] = None,
) -> str:
    """Search for current job listings and return them to the user.

    Call this whenever the user asks to see, find, or check jobs/openings —
    e.g. "show me jobs", "find backend developer roles", "anything new in
    the last 2 days", "jobs for today". The user's saved Job Search
    preferences (role, location, country, day range, salary floor, job
    type, excluded keywords) are applied automatically — you do NOT need to
    ask the user for these before calling the tool. Only pass `role`,
    `location`, or `max_days_old` yourself if the user's message explicitly
    names a different role, place, or day range than what they'd normally
    have saved; otherwise leave them as None and the saved preferences are
    used as-is.

    The tool returns a JSON string. The listings themselves are already
    shown to the user as cards in the UI — do not re-list or re-describe
    each job in your reply. Just give a short one-line summary (how many
    were found, anything notable), and only go into detail on a specific
    job if the user asks a follow-up question about it.

    Args:
        role: Optional override for the job title/keywords to search.
        location: Optional override for the city/region ("Remote" is fine).
        max_days_old: Optional override for how many days back to search.
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
    job_type = prefs.get("job_type") if prefs.get("job_type") not in (None, "any") else None

    try:
        jobs, total_count = search_adzuna_jobs(
            app_id=ADZUNA_APP_ID,
            app_key=ADZUNA_APP_KEY,
            what=effective_role,
            where=effective_location,
            country=prefs.get("country") or "in",
            results_per_page=prefs.get("results_per_page") or 15,
            max_days_old=effective_days,
            min_salary=prefs.get("min_salary"),
            job_type=job_type,
            what_exclude=prefs.get("keywords_exclude"),
        )
    except JobSearchError as e:
        return str(e)

    return json.dumps(
        {
            "jobs": jobs,
            "count": total_count,
            "query": {"role": effective_role, "location": effective_location, "max_days_old": effective_days},
        }
    )


TOOLS = [send_email, search_jobs]


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
location first unless the tool tells you none is saved. The job listings
themselves are rendered to the user separately as cards, so keep your
reply to a short one-line summary rather than listing the jobs yourself.
"""


def build_llm(model_id: str):
    """Instantiate the correct chat model client for the given model id.

    Provider SDKs are imported lazily so you only need the package for the
    provider(s) you actually configured in .env.
    """
    info = MODEL_REGISTRY[model_id]
    provider = info["provider"]
    model_name = info["model"]
    api_key = info["api_key"]

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

    raise ValueError(f"Unknown provider '{provider}' for model '{model_id}'")


def build_agent(model_id: str):
    """
    Build a LangGraph app: a chatbot node bound to TOOLS (currently just
    send_email), plus a tools node it can loop through.

    Flow: chatbot -> (has tool call?) -> tools -> chatbot -> ... -> END.
    `tools_condition` checks the latest AI message for tool_calls and routes
    to the "tools" node if present, or ends the turn otherwise. Conversation
    state is persisted per thread_id via the SQLite checkpointer, so the
    model keeps context (and knows what it already sent) across turns.

    Per-user data (like SMTP credentials for send_email) is NOT baked in
    here — it's read from the run's config at call time, so this same
    compiled graph is reused across every user of a given model.
    """
    llm = build_llm(model_id).bind_tools(TOOLS)

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


_AGENT_CACHE = {}


def get_agent(model_id: str | None = None):
    """Return a cached LangGraph agent for the given model, building it once."""
    selected = normalize_model_id(model_id)

    if not selected:
        raise ValueError(
            "No models configured. Add at least one <PROVIDER>_MODEL_1 and "
            "matching <PROVIDER>_API_KEY to your .env file."
        )

    if selected not in _AGENT_CACHE:
        _AGENT_CACHE[selected] = build_agent(selected)

    return _AGENT_CACHE[selected]