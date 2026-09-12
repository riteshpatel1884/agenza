from dotenv import load_dotenv
import os
import certifi

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

import json
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from langchain_core.messages import HumanMessage, AIMessage, AIMessageChunk

from agent import get_agent, list_models, DEFAULT_MODEL_ID
from database import (
    init_db,
    save_chat_message,
    get_chat_history,
    create_or_update_conversation,
    list_conversations,
)

Path("data").mkdir(exist_ok=True)

app = FastAPI()

# Allow your Next.js dev server (and deployed frontend origin) to call this API.
# Add your production frontend URL here once you deploy.
FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


@app.get("/models")
async def get_models():
    """List of chat models the frontend can let the user pick from."""
    return {"models": list_models(), "default": DEFAULT_MODEL_ID}


@app.get("/conversations")
async def conversations():
    items = list_conversations()

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
async def history(thread_id: str):
    messages = get_chat_history(thread_id)

    return {
        "messages": [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
    }


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
async def chat_stream(request: Request):
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

    create_or_update_conversation(thread_id, user_message)
    save_chat_message(thread_id, "user", user_message)

    config = {"configurable": {"thread_id": thread_id}}

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
                save_chat_message(thread_id, "assistant", final_answer)

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
