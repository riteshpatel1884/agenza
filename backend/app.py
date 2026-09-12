from dotenv import load_dotenv
import os
import certifi

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

import json
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from langchain_core.messages import HumanMessage, AIMessage, AIMessageChunk

from agent import get_agent, list_models, DEFAULT_MODEL_ID
from auth import get_current_user_id
from database import (
    init_db,
    save_chat_message,
    get_chat_history,
    create_or_update_conversation,
    list_conversations,
    rename_conversation,
    delete_conversation,
    get_email_settings,
    save_email_settings,
    delete_email_settings,
    create_automation,
    list_automations,
    set_automation_enabled,
    delete_automation,
)
from scheduler import start_scheduler

Path("data").mkdir(exist_ok=True)

app = FastAPI()

# Allow your Next.js dev server (and deployed frontend origin) to call this API.
# Add your production frontend URL here once you deploy.
FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://agenza-ai.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
start_scheduler()


@app.get("/models")
async def get_models():
    """List of chat models the frontend can let the user pick from. Not user-specific."""
    return {"models": list_models(), "default": DEFAULT_MODEL_ID}


# ---------------------------------------------------------------------------
# Conversations — every route below requires a valid Clerk session
# (`user_id: str = Depends(get_current_user_id)`) and every query is scoped
# to that user_id, so one signed-in user can never see or touch another's
# chats, even if they guess a thread_id.
# ---------------------------------------------------------------------------


@app.get("/conversations")
async def conversations(user_id: str = Depends(get_current_user_id)):
    items = list_conversations(user_id)

    return {
        "conversations": [
            {
                "thread_id": item.thread_id,
                "title": item.title,
                "created_at": item.created_at.isoformat(),
                "updated_at": item.updated_at.isoformat(),
            }
            for item in items
        ]
    }


@app.get("/history/{thread_id}")
async def history(thread_id: str, user_id: str = Depends(get_current_user_id)):
    messages = get_chat_history(user_id, thread_id)

    return {
        "messages": [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
    }


@app.patch("/conversations/{thread_id}")
async def rename_conversation_route(
    thread_id: str, request: Request, user_id: str = Depends(get_current_user_id)
):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    title = (data.get("title") or "").strip()
    if not title:
        return JSONResponse({"error": "title is required."}, status_code=400)

    conversation = rename_conversation(user_id, thread_id, title)
    if not conversation:
        return JSONResponse({"error": "Conversation not found."}, status_code=404)

    return {"thread_id": conversation.thread_id, "title": conversation.title}


@app.delete("/conversations/{thread_id}")
async def delete_conversation_route(thread_id: str, user_id: str = Depends(get_current_user_id)):
    delete_conversation(user_id, thread_id)
    return {"deleted": thread_id}


# ---------------------------------------------------------------------------
# Email settings & automations — user_id now comes from the verified Clerk
# token instead of a path param, so nobody can pass someone else's id and
# read/change their SMTP credentials.
# ---------------------------------------------------------------------------


@app.get("/email-settings")
async def get_email_settings_route(user_id: str = Depends(get_current_user_id)):
    """
    Whether the signed-in user has email connected, and its non-secret
    fields — never the password — so the Settings modal can show something
    like "Connected as you@example.com" without re-displaying the secret.
    """
    settings = get_email_settings(user_id)

    if not settings:
        return {"configured": False}

    return {
        "configured": True,
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_user": settings.smtp_user,
        "smtp_from_name": settings.smtp_from_name,
    }


@app.post("/email-settings")
async def save_email_settings_route(request: Request, user_id: str = Depends(get_current_user_id)):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    smtp_host = (data.get("smtp_host") or "").strip()
    smtp_user = (data.get("smtp_user") or "").strip()
    smtp_password = data.get("smtp_password") or ""
    smtp_from_name = (data.get("smtp_from_name") or "").strip() or "agenza.ai"

    try:
        smtp_port = int(data.get("smtp_port") or 587)
    except (TypeError, ValueError):
        return JSONResponse({"error": "smtp_port must be a number."}, status_code=400)

    if not smtp_host or not smtp_user:
        return JSONResponse({"error": "smtp_host and smtp_user are required."}, status_code=400)

    existing = get_email_settings(user_id)
    if not existing and not smtp_password:
        return JSONResponse({"error": "smtp_password is required the first time you connect."}, status_code=400)

    save_email_settings(
        user_id=user_id,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
        smtp_from_name=smtp_from_name,
    )

    return {"configured": True}


@app.delete("/email-settings")
async def delete_email_settings_route(user_id: str = Depends(get_current_user_id)):
    delete_email_settings(user_id)
    return {"configured": False}


def _automation_to_dict(a):
    return {
        "id": a.id,
        "to_email": a.to_email,
        "subject": a.subject,
        "body": a.body,
        "frequency": a.frequency,
        "time_of_day": a.time_of_day,
        "enabled": bool(a.enabled),
        "last_sent_at": a.last_sent_at.isoformat() if a.last_sent_at else None,
    }


@app.get("/automations")
async def get_automations_route(user_id: str = Depends(get_current_user_id)):
    return {"automations": [_automation_to_dict(a) for a in list_automations(user_id)]}


@app.post("/automations")
async def create_automation_route(request: Request, user_id: str = Depends(get_current_user_id)):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    to_email = (data.get("to_email") or "").strip()
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()
    frequency = data.get("frequency")
    time_of_day = (data.get("time_of_day") or "").strip() or None

    if not to_email or not subject or not body:
        return JSONResponse({"error": "to_email, subject, and body are required."}, status_code=400)

    if frequency not in ("hourly", "daily"):
        return JSONResponse({"error": "frequency must be 'hourly' or 'daily'."}, status_code=400)

    if frequency == "daily" and not time_of_day:
        return JSONResponse({"error": "time_of_day (HH:MM) is required for daily automations."}, status_code=400)

    if not get_email_settings(user_id):
        return JSONResponse({"error": "Connect your email in Settings before creating an automation."}, status_code=400)

    automation = create_automation(user_id, to_email, subject, body, frequency, time_of_day)
    return _automation_to_dict(automation)


@app.patch("/automations/{automation_id}")
async def update_automation_route(
    automation_id: int, request: Request, user_id: str = Depends(get_current_user_id)
):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    automation = set_automation_enabled(user_id, automation_id, bool(data.get("enabled", True)))
    if not automation:
        return JSONResponse({"error": "Automation not found."}, status_code=404)

    return _automation_to_dict(automation)


@app.delete("/automations/{automation_id}")
async def delete_automation_route(automation_id: int, user_id: str = Depends(get_current_user_id)):
    delete_automation(user_id, automation_id)
    return {"deleted": automation_id}


def sse_data(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def should_stream_chunk(chunk) -> bool:
    if not isinstance(chunk, (AIMessage, AIMessageChunk)):
        return False
    if getattr(chunk, "tool_calls", None):
        return False
    return True


def extract_text_from_chunk(chunk) -> str:
    content = getattr(chunk, "content", "")

    if not content:
        return ""

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, str):
                text_parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                text_parts.append(item["text"])
        return "".join(text_parts)

    return ""


@app.post("/chat/stream")
async def chat_stream(request: Request, user_id: str = Depends(get_current_user_id)):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    user_message = data.get("message", "")
    thread_id = data.get("thread_id", "default")
    selected_model = data.get("model", DEFAULT_MODEL_ID)

    if not user_message.strip():
        return JSONResponse({"error": "Message is required."}, status_code=400)

    try:
        agent = get_agent(selected_model)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    create_or_update_conversation(user_id, thread_id, user_message)
    save_chat_message(user_id, thread_id, "user", user_message)

    # Namespace the LangGraph thread by user_id too, so conversation memory
    # can never be shared across users even in the (extremely unlikely)
    # event of a thread_id collision between two different browsers.
    configurable = {"thread_id": f"{user_id}:{thread_id}"}

    email_settings = get_email_settings(user_id)
    if email_settings:
        configurable["smtp"] = {
            "host": email_settings.smtp_host,
            "port": email_settings.smtp_port,
            "user": email_settings.smtp_user,
            "password": email_settings.smtp_password,
            "from_name": email_settings.smtp_from_name,
        }

    config = {"configurable": configurable}

    def event_generator():
        final_answer = ""

        try:
            inputs = {"messages": [HumanMessage(content=user_message)]}

            for chunk, metadata in agent.stream(inputs, config=config, stream_mode="messages"):
                if not should_stream_chunk(chunk):
                    continue

                token = extract_text_from_chunk(chunk)

                if token:
                    final_answer += token
                    yield sse_data({"token": token})

            if final_answer.strip():
                save_chat_message(user_id, thread_id, "assistant", final_answer)

            yield sse_data({"done": True})

        except Exception as e:
            yield sse_data({"error": str(e)})
            yield sse_data({"done": True})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8080, reload=True)
