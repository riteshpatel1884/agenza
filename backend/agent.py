import os
import re
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
import certifi

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from langchain_core.messages import SystemMessage
from langgraph.graph import StateGraph, START, MessagesState
from langgraph.checkpoint.sqlite import SqliteSaver

Path("data").mkdir(exist_ok=True)


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


SYSTEM_PROMPT = """
You are a helpful AI assistant. Answer clearly, concisely, and honestly.
If you are not sure about something, say so instead of guessing.
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
    Build a minimal LangGraph app: a single node that calls the selected LLM.

    Conversation state is persisted per thread_id via the SQLite checkpointer,
    so the model keeps context across turns of the same chat. No tools yet —
    that comes in a later phase (email, calendar, web search, RAG, etc).
    """
    llm = build_llm(model_id)

    def chatbot_node(state: MessagesState):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
        response = llm.invoke(messages)
        return {"messages": [response]}

    workflow = StateGraph(MessagesState)
    workflow.add_node("chatbot", chatbot_node)
    workflow.add_edge(START, "chatbot")

    conn = sqlite3.connect("data/langgraph_checkpoints.sqlite", check_same_thread=False)
    checkpointer = SqliteSaver(conn)

    return workflow.compile(checkpointer=checkpointer)


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
