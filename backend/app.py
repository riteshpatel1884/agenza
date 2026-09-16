# from dotenv import load_dotenv
# import os
# import certifi

# load_dotenv()

# os.environ["SSL_CERT_FILE"] = certifi.where()
# os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# import json
# import logging
# from pathlib import Path

# import uvicorn
# from fastapi import Depends, FastAPI, File, Request, UploadFile
# from fastapi.responses import StreamingResponse, JSONResponse
# from fastapi.middleware.cors import CORSMiddleware

# from langchain_core.messages import HumanMessage, AIMessage, AIMessageChunk

# logger = logging.getLogger("agenza")

# from agent import get_agent, extract_resume_data
# from auth import get_current_user_id
# from database import (
#     init_db,
#     save_chat_message,
#     get_chat_history,
#     create_or_update_conversation,
#     list_conversations,
#     rename_conversation,
#     delete_conversation,
#     get_email_settings,
#     save_email_settings,
#     delete_email_settings,
#     create_automation,
#     list_automations,
#     set_automation_enabled,
#     delete_automation,
#     get_job_preferences,
#     save_job_preferences,
#     get_resume,
#     save_resume,
#     delete_resume,
#     resume_to_dict,
#     get_usage_status,
#     add_usage,
#     UNLIMITED_TOKEN_LIMIT,
# )
# from resume_parsing import extract_text_from_upload, validate_upload, UnsupportedResumeFormat
# from scheduler import start_scheduler

# Path("data").mkdir(exist_ok=True)

# app = FastAPI()

# # Allow your Next.js dev server (and deployed frontend origin) to call this API.
# # Add your production frontend URL here once you deploy.
# FRONTEND_ORIGINS = [
#     "http://localhost:3000",
#     "http://127.0.0.1:3000",
#     "https://agenza-ai.vercel.app",
# ]

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=FRONTEND_ORIGINS,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# init_db()
# start_scheduler()

# # ---------------------------------------------------------------------------
# # Hourly token budget per user — a soft rate limit so one heavy user or one
# # runaway conversation can't run up the whole app's provider bill. Override
# # via HOURLY_TOKEN_LIMIT in .env; defaults to a conservative 20,000.
# #
# # Usage is approximated as len(text) // 4 (a common rule of thumb for
# # English text) rather than counted with a real tokenizer — the providers
# # in this app's model registry (Gemini, Groq, Mistral) each tokenize
# # differently, so no single exact count would be correct for all of them
# # anyway. This is intentionally a soft safety net, not a billing meter.
# # ---------------------------------------------------------------------------

# HOURLY_TOKEN_LIMIT = int(os.getenv("HOURLY_TOKEN_LIMIT", "2500"))


# def approx_token_count(text: str) -> int:
#     return max(1, len(text) // 4)


# @app.get("/usage")
# async def get_usage_route(user_id: str = Depends(get_current_user_id)):
#     allowed, tokens_used, seconds_until_reset, total_tokens_used, limit = get_usage_status(
#         user_id, HOURLY_TOKEN_LIMIT
#     )
#     unlimited = limit == UNLIMITED_TOKEN_LIMIT
#     return {
#         # This is the *effective* limit — the app-wide default unless this
#         # user has a manual override set (see set_user_token_limit in
#         # database.py), in which case that override is returned instead.
#         # Sent as null (not -1) when the user is unlimited, since the
#         # frontend formats this as a plain number.
#         "limit": None if unlimited else limit,
#         "unlimited": unlimited,
#         "tokens_used": tokens_used,
#         "allowed": allowed,
#         "seconds_until_reset": seconds_until_reset,
#         # Lifetime counter, never cleared by the hourly window reset — shown
#         # in full (not abbreviated) in the usage popup on the frontend.
#         "total_tokens_used": total_tokens_used,
#     }


# # ---------------------------------------------------------------------------
# # Conversations — every route below requires a valid Clerk session
# # (`user_id: str = Depends(get_current_user_id)`) and every query is scoped
# # to that user_id, so one signed-in user can never see or touch another's
# # chats, even if they guess a thread_id.
# # ---------------------------------------------------------------------------


# @app.get("/conversations")
# async def conversations(user_id: str = Depends(get_current_user_id)):
#     items = list_conversations(user_id)

#     return {
#         "conversations": [
#             {
#                 "thread_id": item.thread_id,
#                 "title": item.title,
#                 "created_at": item.created_at.isoformat(),
#                 "updated_at": item.updated_at.isoformat(),
#             }
#             for item in items
#         ]
#     }


# @app.get("/history/{thread_id}")
# async def history(thread_id: str, user_id: str = Depends(get_current_user_id)):
#     messages = get_chat_history(user_id, thread_id)

#     return {
#         "messages": [
#             {"role": msg.role, "content": msg.content}
#             for msg in messages
#         ]
#     }


# @app.patch("/conversations/{thread_id}")
# async def rename_conversation_route(
#     thread_id: str, request: Request, user_id: str = Depends(get_current_user_id)
# ):
#     try:
#         data = await request.json()
#     except Exception:
#         return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

#     title = (data.get("title") or "").strip()
#     if not title:
#         return JSONResponse({"error": "title is required."}, status_code=400)

#     conversation = rename_conversation(user_id, thread_id, title)
#     if not conversation:
#         return JSONResponse({"error": "Conversation not found."}, status_code=404)

#     return {"thread_id": conversation.thread_id, "title": conversation.title}


# @app.delete("/conversations/{thread_id}")
# async def delete_conversation_route(thread_id: str, user_id: str = Depends(get_current_user_id)):
#     delete_conversation(user_id, thread_id)
#     return {"deleted": thread_id}


# # ---------------------------------------------------------------------------
# # Email settings & automations — user_id now comes from the verified Clerk
# # token instead of a path param, so nobody can pass someone else's id and
# # read/change their SMTP credentials.
# # ---------------------------------------------------------------------------


# @app.get("/email-settings")
# async def get_email_settings_route(user_id: str = Depends(get_current_user_id)):
#     """
#     Whether the signed-in user has email connected, and its non-secret
#     fields — never the password — so the Settings modal can show something
#     like "Connected as you@example.com" without re-displaying the secret.
#     """
#     settings = get_email_settings(user_id)

#     if not settings:
#         return {"configured": False}

#     return {
#         "configured": True,
#         "smtp_host": settings.smtp_host,
#         "smtp_port": settings.smtp_port,
#         "smtp_user": settings.smtp_user,
#         "smtp_from_name": settings.smtp_from_name,
#     }


# @app.post("/email-settings")
# async def save_email_settings_route(request: Request, user_id: str = Depends(get_current_user_id)):
#     try:
#         data = await request.json()
#     except Exception:
#         return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

#     smtp_host = (data.get("smtp_host") or "").strip()
#     smtp_user = (data.get("smtp_user") or "").strip()
#     smtp_password = data.get("smtp_password") or ""
#     smtp_from_name = (data.get("smtp_from_name") or "").strip() or "agenza.ai"

#     try:
#         smtp_port = int(data.get("smtp_port") or 587)
#     except (TypeError, ValueError):
#         return JSONResponse({"error": "smtp_port must be a number."}, status_code=400)

#     if not smtp_host or not smtp_user:
#         return JSONResponse({"error": "smtp_host and smtp_user are required."}, status_code=400)

#     existing = get_email_settings(user_id)
#     if not existing and not smtp_password:
#         return JSONResponse({"error": "smtp_password is required the first time you connect."}, status_code=400)

#     save_email_settings(
#         user_id=user_id,
#         smtp_host=smtp_host,
#         smtp_port=smtp_port,
#         smtp_user=smtp_user,
#         smtp_password=smtp_password,
#         smtp_from_name=smtp_from_name,
#     )

#     return {"configured": True}


# @app.delete("/email-settings")
# async def delete_email_settings_route(user_id: str = Depends(get_current_user_id)):
#     delete_email_settings(user_id)
#     return {"configured": False}


# def _job_preferences_to_dict(p):
#     return {
#         "role": p.role or "",
#         "location": p.location or "",
#         "country": p.country or "in",
#         "max_days_old": p.max_days_old or 3,
#         "results_per_page": p.results_per_page or 40,
#         "min_salary": p.min_salary,
#         "job_type": p.job_type or "any",
#         "remote_only": bool(p.remote_only),
#         "keywords_exclude": p.keywords_exclude or "",
#     }


# @app.get("/job-preferences")
# async def get_job_preferences_route(user_id: str = Depends(get_current_user_id)):
#     prefs = get_job_preferences(user_id)

#     if not prefs:
#         return {"configured": False}

#     return {"configured": True, **_job_preferences_to_dict(prefs)}


# @app.post("/job-preferences")
# async def save_job_preferences_route(request: Request, user_id: str = Depends(get_current_user_id)):
#     try:
#         data = await request.json()
#     except Exception:
#         return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

#     role = (data.get("role") or "").strip()
#     if not role:
#         return JSONResponse({"error": "role is required."}, status_code=400)

#     min_salary = data.get("min_salary")
#     try:
#         min_salary = int(min_salary) if min_salary not in (None, "") else None
#     except (TypeError, ValueError):
#         return JSONResponse({"error": "min_salary must be a number."}, status_code=400)

#     try:
#         max_days_old = int(data.get("max_days_old") or 3)
#         results_per_page = int(data.get("results_per_page") or 40)
#     except (TypeError, ValueError):
#         return JSONResponse({"error": "max_days_old and results_per_page must be numbers."}, status_code=400)

#     job_type = data.get("job_type") or "any"
#     if job_type not in ("any", "full_time", "part_time", "contract", "permanent"):
#         return JSONResponse({"error": "Invalid job_type."}, status_code=400)

#     prefs = save_job_preferences(
#         user_id=user_id,
#         role=role,
#         location=(data.get("location") or "").strip(),
#         country=(data.get("country") or "in").strip().lower(),
#         max_days_old=max_days_old,
#         results_per_page=results_per_page,
#         min_salary=min_salary,
#         job_type=job_type,
#         remote_only=bool(data.get("remote_only")),
#         keywords_exclude=(data.get("keywords_exclude") or "").strip(),
#     )

#     return {"configured": True, **_job_preferences_to_dict(prefs)}


# # ---------------------------------------------------------------------------
# # Resume — upload once, parsed into structured skills/experience/education/
# # projects/preferred_roles (see agent.extract_resume_data), then used
# # automatically by search_jobs (to infer a role when none is set, and to
# # score every listing's relevance — see job_scoring.py) without the user
# # ever pasting it into the chat.
# # ---------------------------------------------------------------------------


# @app.get("/resume")
# async def get_resume_route(user_id: str = Depends(get_current_user_id)):
#     data = resume_to_dict(get_resume(user_id))

#     if not data:
#         return {"configured": False}

#     return {"configured": True, **data}


# @app.post("/resume")
# async def upload_resume_route(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
#     content = await file.read()

#     try:
#         validate_upload(file.filename, content)
#     except UnsupportedResumeFormat as e:
#         return JSONResponse({"error": str(e)}, status_code=400)

#     text = extract_text_from_upload(file.filename, content)
#     if not text.strip():
#         return JSONResponse(
#             {
#                 "error": "Couldn't read any text out of that file — try a different PDF/DOCX export, "
#                 "or paste the resume into a .txt file and upload that instead."
#             },
#             status_code=400,
#         )

#     extracted = extract_resume_data(text)

#     resume = save_resume(
#         user_id,
#         filename=file.filename or "resume",
#         raw_text=text,
#         skills=extracted["skills"],
#         experience=extracted["experience"],
#         education=extracted["education"],
#         projects=extracted["projects"],
#         preferred_roles=extracted["preferred_roles"],
#         experience_years=extracted["experience_years"],
#     )

#     return {"configured": True, **resume_to_dict(resume)}


# @app.delete("/resume")
# async def delete_resume_route(user_id: str = Depends(get_current_user_id)):
#     delete_resume(user_id)
#     return {"configured": False}


# def _automation_to_dict(a):
#     return {
#         "id": a.id,
#         "to_email": a.to_email,
#         "subject": a.subject,
#         "body": a.body,
#         "frequency": a.frequency,
#         "time_of_day": a.time_of_day,
#         "enabled": bool(a.enabled),
#         "last_sent_at": a.last_sent_at.isoformat() if a.last_sent_at else None,
#     }


# @app.get("/automations")
# async def get_automations_route(user_id: str = Depends(get_current_user_id)):
#     return {"automations": [_automation_to_dict(a) for a in list_automations(user_id)]}


# @app.post("/automations")
# async def create_automation_route(request: Request, user_id: str = Depends(get_current_user_id)):
#     try:
#         data = await request.json()
#     except Exception:
#         return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

#     to_email = (data.get("to_email") or "").strip()
#     subject = (data.get("subject") or "").strip()
#     body = (data.get("body") or "").strip()
#     frequency = data.get("frequency")
#     time_of_day = (data.get("time_of_day") or "").strip() or None

#     if not to_email or not subject or not body:
#         return JSONResponse({"error": "to_email, subject, and body are required."}, status_code=400)

#     if frequency not in ("hourly", "daily"):
#         return JSONResponse({"error": "frequency must be 'hourly' or 'daily'."}, status_code=400)

#     if frequency == "daily" and not time_of_day:
#         return JSONResponse({"error": "time_of_day (HH:MM) is required for daily automations."}, status_code=400)

#     if not get_email_settings(user_id):
#         return JSONResponse({"error": "Connect your email in Settings before creating an automation."}, status_code=400)

#     automation = create_automation(user_id, to_email, subject, body, frequency, time_of_day)
#     return _automation_to_dict(automation)


# @app.patch("/automations/{automation_id}")
# async def update_automation_route(
#     automation_id: int, request: Request, user_id: str = Depends(get_current_user_id)
# ):
#     try:
#         data = await request.json()
#     except Exception:
#         return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

#     automation = set_automation_enabled(user_id, automation_id, bool(data.get("enabled", True)))
#     if not automation:
#         return JSONResponse({"error": "Automation not found."}, status_code=404)

#     return _automation_to_dict(automation)


# @app.delete("/automations/{automation_id}")
# async def delete_automation_route(automation_id: int, user_id: str = Depends(get_current_user_id)):
#     delete_automation(user_id, automation_id)
#     return {"deleted": automation_id}


# def sse_data(payload: dict) -> str:
#     return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# def should_stream_chunk(chunk) -> bool:
#     if not isinstance(chunk, (AIMessage, AIMessageChunk)):
#         return False
#     if getattr(chunk, "tool_calls", None):
#         return False
#     return True


# def extract_text_from_chunk(chunk) -> str:
#     content = getattr(chunk, "content", "")

#     if not content:
#         return ""

#     if isinstance(content, str):
#         return content

#     if isinstance(content, list):
#         text_parts = []
#         for item in content:
#             if isinstance(item, str):
#                 text_parts.append(item)
#             elif isinstance(item, dict) and isinstance(item.get("text"), str):
#                 text_parts.append(item["text"])
#         return "".join(text_parts)

#     return ""


# @app.post("/chat/stream")
# async def chat_stream(request: Request, user_id: str = Depends(get_current_user_id)):
#     try:
#         data = await request.json()
#     except Exception:
#         return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

#     user_message = data.get("message", "")
#     thread_id = data.get("thread_id", "default")

#     if not user_message.strip():
#         return JSONResponse({"error": "Message is required."}, status_code=400)

#     allowed, tokens_used, seconds_until_reset, _total_tokens_used, _limit = get_usage_status(
#         user_id, HOURLY_TOKEN_LIMIT
#     )
#     if not allowed:
#         minutes_left = max(1, (seconds_until_reset + 59) // 60)

#         def blocked_stream():
#             yield sse_data(
#                 {
#                     "error": (
#                         f"You've reached your usage limit for this hour. "
#                         f"Please try again in about {minutes_left} minute"
#                         f"{'s' if minutes_left != 1 else ''}."
#                     )
#                 }
#             )
#             yield sse_data({"done": True})

#         return StreamingResponse(
#             blocked_stream(),
#             media_type="text/event-stream",
#             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
#         )

#     try:
#         agent = get_agent()
#     except ValueError as e:
#         return JSONResponse({"error": str(e)}, status_code=400)

#     create_or_update_conversation(user_id, thread_id, user_message)
#     save_chat_message(user_id, thread_id, "user", user_message)

#     # Namespace the LangGraph thread by user_id too, so conversation memory
#     # can never be shared across users even in the (extremely unlikely)
#     # event of a thread_id collision between two different browsers.
#     configurable = {"thread_id": f"{user_id}:{thread_id}"}

#     email_settings = get_email_settings(user_id)
#     if email_settings:
#         configurable["smtp"] = {
#             "host": email_settings.smtp_host,
#             "port": email_settings.smtp_port,
#             "user": email_settings.smtp_user,
#             "password": email_settings.smtp_password,
#             "from_name": email_settings.smtp_from_name,
#         }

#     job_prefs = get_job_preferences(user_id)
#     if job_prefs:
#         configurable["job_preferences"] = {
#             "role": job_prefs.role,
#             "location": job_prefs.location,
#             "country": job_prefs.country,
#             "max_days_old": job_prefs.max_days_old,
#             "results_per_page": job_prefs.results_per_page,
#             "min_salary": job_prefs.min_salary,
#             "job_type": job_prefs.job_type,
#             "remote_only": bool(job_prefs.remote_only),
#             "keywords_exclude": job_prefs.keywords_exclude,
#         }

#     resume_dict = resume_to_dict(get_resume(user_id))
#     if resume_dict:
#         # search_jobs (agent.py) uses this to infer a role when the user
#         # hasn't set one, and job_scoring.py uses it to score every
#         # listing's Skills Match / Experience Match.
#         configurable["resume"] = resume_dict

#     config = {"configurable": configurable}

#     def event_generator():
#         final_answer = ""

#         try:
#             inputs = {"messages": [HumanMessage(content=user_message)]}

#             # "messages" streams token-by-token AI output as before.
#             # "custom" carries the job-search tool's full results, emitted
#             # via get_stream_writer() in agent.py rather than stored in
#             # conversation memory — see the comment above search_jobs.
#             for stream_mode, payload in agent.stream(
#                 inputs, config=config, stream_mode=["messages", "custom"]
#             ):
#                 if stream_mode == "custom":
#                     if isinstance(payload, dict) and payload.get("type") == "jobs":
#                         yield sse_data({"jobs": payload.get("jobs", []), "count": payload.get("count")})
#                     continue

#                 chunk, metadata = payload

#                 if not should_stream_chunk(chunk):
#                     continue

#                 token = extract_text_from_chunk(chunk)

#                 if token:
#                     final_answer += token
#                     yield sse_data({"token": token})

#             if final_answer.strip():
#                 save_chat_message(user_id, thread_id, "assistant", final_answer)

#             tokens_spent = approx_token_count(user_message) + approx_token_count(final_answer)
#             add_usage(user_id, tokens_spent)

#             yield sse_data({"done": True})

#         except Exception:
#             # Never forward raw provider/SDK exception text to the client —
#             # it can include internal identifiers (org IDs, billing links)
#             # and isn't something a user can act on anyway. Full details go
#             # to the server log for debugging.
#             logger.exception("chat_stream failed for user_id=%s thread_id=%s", user_id, thread_id)
#             yield sse_data(
#                 {"error": "Something went wrong while generating a response. Please try again in a moment."}
#             )
#             yield sse_data({"done": True})

#     return StreamingResponse(
#         event_generator(),
#         media_type="text/event-stream",
#         headers={
#             "Cache-Control": "no-cache",
#             "Connection": "keep-alive",
#             "X-Accel-Buffering": "no",
#         },
#     )


# if __name__ == "__main__":
#     uvicorn.run("app:app", host="0.0.0.0", port=8080, reload=True)


from dotenv import load_dotenv
import os
import certifi

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

import json
import logging
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from langchain_core.messages import HumanMessage, AIMessage, AIMessageChunk

logger = logging.getLogger("agenza")

from agent import get_agent, extract_resume_data
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
    get_job_preferences,
    save_job_preferences,
    get_resume,
    save_resume,
    delete_resume,
    update_resume_fields,
    resume_to_dict,
    save_job,
    list_saved_jobs,
    delete_saved_job,
    saved_job_to_dict,
    get_usage_status,
    add_usage,
    UNLIMITED_TOKEN_LIMIT,
)
from resume_parsing import extract_text_from_upload, validate_upload, UnsupportedResumeFormat
from scheduler import start_scheduler

Path("data").mkdir(exist_ok=True)

app = FastAPI()

# Allow your Next.js dev server (and deployed frontend origin) to call this API.
# Add your production frontend URL here once you deploy.
FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://leaderlab.in",
    "https://www.leaderlab.in"
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

# ---------------------------------------------------------------------------
# Hourly token budget per user — a soft rate limit so one heavy user or one
# runaway conversation can't run up the whole app's provider bill. Override
# via HOURLY_TOKEN_LIMIT in .env; defaults to a conservative 20,000.
#
# Usage is approximated as len(text) // 4 (a common rule of thumb for
# English text) rather than counted with a real tokenizer — the providers
# in this app's model registry (Gemini, Groq, Mistral) each tokenize
# differently, so no single exact count would be correct for all of them
# anyway. This is intentionally a soft safety net, not a billing meter.
# ---------------------------------------------------------------------------

HOURLY_TOKEN_LIMIT = int(os.getenv("HOURLY_TOKEN_LIMIT", "2500"))


def approx_token_count(text: str) -> int:
    return max(1, len(text) // 4)


@app.get("/usage")
async def get_usage_route(user_id: str = Depends(get_current_user_id)):
    allowed, tokens_used, seconds_until_reset, total_tokens_used, limit = get_usage_status(
        user_id, HOURLY_TOKEN_LIMIT
    )
    unlimited = limit == UNLIMITED_TOKEN_LIMIT
    return {
        # This is the *effective* limit — the app-wide default unless this
        # user has a manual override set (see set_user_token_limit in
        # database.py), in which case that override is returned instead.
        # Sent as null (not -1) when the user is unlimited, since the
        # frontend formats this as a plain number.
        "limit": None if unlimited else limit,
        "unlimited": unlimited,
        "tokens_used": tokens_used,
        "allowed": allowed,
        "seconds_until_reset": seconds_until_reset,
        # Lifetime counter, never cleared by the hourly window reset — shown
        # in full (not abbreviated) in the usage popup on the frontend.
        "total_tokens_used": total_tokens_used,
    }


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


def _job_preferences_to_dict(p):
    return {
        "role": p.role or "",
        "location": p.location or "",
        "country": p.country or "in",
        "max_days_old": p.max_days_old or 3,
        "results_per_page": p.results_per_page or 40,
        "min_salary": p.min_salary,
        "job_type": p.job_type or "any",
        "remote_only": bool(p.remote_only),
        "keywords_exclude": p.keywords_exclude or "",
    }


@app.get("/job-preferences")
async def get_job_preferences_route(user_id: str = Depends(get_current_user_id)):
    prefs = get_job_preferences(user_id)

    if not prefs:
        return {"configured": False}

    return {"configured": True, **_job_preferences_to_dict(prefs)}


@app.post("/job-preferences")
async def save_job_preferences_route(request: Request, user_id: str = Depends(get_current_user_id)):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    role = (data.get("role") or "").strip()
    if not role:
        return JSONResponse({"error": "role is required."}, status_code=400)

    min_salary = data.get("min_salary")
    try:
        min_salary = int(min_salary) if min_salary not in (None, "") else None
    except (TypeError, ValueError):
        return JSONResponse({"error": "min_salary must be a number."}, status_code=400)

    try:
        max_days_old = int(data.get("max_days_old") or 3)
        results_per_page = int(data.get("results_per_page") or 40)
    except (TypeError, ValueError):
        return JSONResponse({"error": "max_days_old and results_per_page must be numbers."}, status_code=400)

    job_type = data.get("job_type") or "any"
    if job_type not in ("any", "full_time", "part_time", "contract", "permanent"):
        return JSONResponse({"error": "Invalid job_type."}, status_code=400)

    prefs = save_job_preferences(
        user_id=user_id,
        role=role,
        location=(data.get("location") or "").strip(),
        country=(data.get("country") or "in").strip().lower(),
        max_days_old=max_days_old,
        results_per_page=results_per_page,
        min_salary=min_salary,
        job_type=job_type,
        remote_only=bool(data.get("remote_only")),
        keywords_exclude=(data.get("keywords_exclude") or "").strip(),
    )

    return {"configured": True, **_job_preferences_to_dict(prefs)}


# ---------------------------------------------------------------------------
# Resume — upload once, parsed into structured skills/experience/education/
# projects/preferred_roles (see agent.extract_resume_data), then used
# automatically by search_jobs (to infer a role when none is set, and to
# score every listing's relevance — see job_scoring.py) without the user
# ever pasting it into the chat.
# ---------------------------------------------------------------------------


@app.get("/resume")
async def get_resume_route(user_id: str = Depends(get_current_user_id)):
    data = resume_to_dict(get_resume(user_id))

    if not data:
        return {"configured": False}

    return {"configured": True, **data}


@app.post("/resume")
async def upload_resume_route(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    content = await file.read()

    try:
        validate_upload(file.filename, content)
    except UnsupportedResumeFormat as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    text = extract_text_from_upload(file.filename, content)
    if not text.strip():
        return JSONResponse(
            {
                "error": "Couldn't read any text out of that file — try a different PDF/DOCX export, "
                "or paste the resume into a .txt file and upload that instead."
            },
            status_code=400,
        )

    extracted = extract_resume_data(text)

    resume = save_resume(
        user_id,
        filename=file.filename or "resume",
        raw_text=text,
        skills=extracted["skills"],
        experience=extracted["experience"],
        education=extracted["education"],
        projects=extracted["projects"],
        preferred_roles=extracted["preferred_roles"],
        experience_years=extracted["experience_years"],
    )

    return {"configured": True, **resume_to_dict(resume)}


@app.delete("/resume")
async def delete_resume_route(user_id: str = Depends(get_current_user_id)):
    delete_resume(user_id)
    return {"configured": False}


@app.patch("/resume")
async def update_resume_route(request: Request, user_id: str = Depends(get_current_user_id)):
    """
    Hand-edits the signed-in user's parsed resume — used by the Settings >
    Job Search > Resume "Edit" mode to fix up preferred roles, years of
    experience, and skills (including deleting one) without re-uploading a
    file. Always overwrites all three fields with what's sent, so the
    frontend should submit the user's full current lists each time (not a
    diff) — an empty skills array is a deliberate "clear all skills",
    not "leave alone".
    """
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    raw_skills = data.get("skills")
    raw_roles = data.get("preferred_roles")

    if not isinstance(raw_skills, list) or not isinstance(raw_roles, list):
        return JSONResponse({"error": "skills and preferred_roles must be lists."}, status_code=400)

    experience_years = data.get("experience_years")
    if experience_years is not None:
        try:
            experience_years = float(experience_years)
        except (TypeError, ValueError):
            return JSONResponse({"error": "experience_years must be a number."}, status_code=400)
        if experience_years < 0:
            return JSONResponse({"error": "experience_years can't be negative."}, status_code=400)

    skills = [s.strip() for s in raw_skills if isinstance(s, str) and s.strip()]
    preferred_roles = [r.strip() for r in raw_roles if isinstance(r, str) and r.strip()]

    resume = update_resume_fields(
        user_id, skills=skills, preferred_roles=preferred_roles, experience_years=experience_years
    )

    return {"configured": True, **resume_to_dict(resume)}


# ---------------------------------------------------------------------------
# Saved jobs — bookmarking a listing from a search result so the user can
# come back to it later. Surfaced in the header's saved-jobs popup.
# job_id is a stable string computed the same way on the frontend (see
# computeJobId in lib/api.js) — the listing's URL when it has one,
# otherwise a "title::company::location" fallback — since none of the
# sources in job_aggregator.py hand back a real id of their own.
# ---------------------------------------------------------------------------


@app.get("/saved-jobs")
async def get_saved_jobs_route(user_id: str = Depends(get_current_user_id)):
    jobs = list_saved_jobs(user_id)
    return {"jobs": [saved_job_to_dict(j) for j in jobs]}


@app.post("/saved-jobs")
async def save_job_route(request: Request, user_id: str = Depends(get_current_user_id)):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    job_id = (data.get("job_id") or "").strip()
    if not job_id:
        return JSONResponse({"error": "job_id is required."}, status_code=400)

    saved = save_job(user_id, job_id, data)
    return {"saved": True, "job": saved_job_to_dict(saved)}


@app.delete("/saved-jobs")
async def delete_saved_job_route(job_id: str, user_id: str = Depends(get_current_user_id)):
    """job_id comes in as a query param (?job_id=...) rather than a path
    segment — saved job ids are often full URLs, which don't survive being
    embedded in a path segment cleanly across every server/proxy."""
    delete_saved_job(user_id, job_id)
    return {"deleted": job_id}


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

    if not user_message.strip():
        return JSONResponse({"error": "Message is required."}, status_code=400)

    allowed, tokens_used, seconds_until_reset, _total_tokens_used, _limit = get_usage_status(
        user_id, HOURLY_TOKEN_LIMIT
    )
    if not allowed:
        minutes_left = max(1, (seconds_until_reset + 59) // 60)

        def blocked_stream():
            yield sse_data(
                {
                    "error": (
                        f"You've reached your usage limit for this hour. "
                        f"Please try again in about {minutes_left} minute"
                        f"{'s' if minutes_left != 1 else ''}."
                    )
                }
            )
            yield sse_data({"done": True})

        return StreamingResponse(
            blocked_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    try:
        agent = get_agent()
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

    job_prefs = get_job_preferences(user_id)
    if job_prefs:
        configurable["job_preferences"] = {
            "role": job_prefs.role,
            "location": job_prefs.location,
            "country": job_prefs.country,
            "max_days_old": job_prefs.max_days_old,
            "results_per_page": job_prefs.results_per_page,
            "min_salary": job_prefs.min_salary,
            "job_type": job_prefs.job_type,
            "remote_only": bool(job_prefs.remote_only),
            "keywords_exclude": job_prefs.keywords_exclude,
        }

    resume_dict = resume_to_dict(get_resume(user_id))
    if resume_dict:
        # search_jobs (agent.py) uses this to infer a role when the user
        # hasn't set one, and job_scoring.py uses it to score every
        # listing's Skills Match / Experience Match.
        configurable["resume"] = resume_dict

    config = {"configurable": configurable}

    def event_generator():
        final_answer = ""

        try:
            inputs = {"messages": [HumanMessage(content=user_message)]}

            # "messages" streams token-by-token AI output as before.
            # "custom" carries the job-search tool's full results, emitted
            # via get_stream_writer() in agent.py rather than stored in
            # conversation memory — see the comment above search_jobs.
            for stream_mode, payload in agent.stream(
                inputs, config=config, stream_mode=["messages", "custom"]
            ):
                if stream_mode == "custom":
                    if isinstance(payload, dict) and payload.get("type") == "jobs":
                        yield sse_data(
                            {
                                "jobs": payload.get("jobs", []),
                                "count": payload.get("count"),
                                "page_size": payload.get("page_size"),
                            }
                        )
                    continue

                chunk, metadata = payload

                if not should_stream_chunk(chunk):
                    continue

                token = extract_text_from_chunk(chunk)

                if token:
                    final_answer += token
                    yield sse_data({"token": token})

            if final_answer.strip():
                save_chat_message(user_id, thread_id, "assistant", final_answer)

            tokens_spent = approx_token_count(user_message) + approx_token_count(final_answer)
            add_usage(user_id, tokens_spent)

            yield sse_data({"done": True})

        except Exception:
            # Never forward raw provider/SDK exception text to the client —
            # it can include internal identifiers (org IDs, billing links)
            # and isn't something a user can act on anyway. Full details go
            # to the server log for debugging.
            logger.exception("chat_stream failed for user_id=%s thread_id=%s", user_id, thread_id)
            yield sse_data(
                {"error": "Something went wrong while generating a response. Please try again in a moment."}
            )
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