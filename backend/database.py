import json
import os
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    Float,
    String,
    Text,
    DateTime,
    UniqueConstraint,
    inspect,
)
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# ---------------------------------------------------------------------------
# Neon Postgres connection.
#
# Get this connection string from your Neon project dashboard -> Connection
# Details. It looks like:
#
#   DATABASE_URL=postgresql://user:password@ep-xxxx.aws.neon.tech/dbname?sslmode=require
#
# psycopg (v3) is used as the driver — SQLAlchemy needs the `+psycopg` in the
# URL scheme to pick it, so we rewrite a plain "postgresql://" string to
# "postgresql+psycopg://" automatically if that's what you pasted in.
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ["DATABASE_URL"]

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("user_id", "thread_id", name="uq_conversations_user_thread"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    thread_id = Column(String, index=True, nullable=False)
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    thread_id = Column(String, index=True)
    role = Column(String)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class EmailSettings(Base):
    """
    Per-user SMTP credentials, entered through the Settings modal. Keyed by
    the signed-in user's Clerk id.
    """

    __tablename__ = "email_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    smtp_host = Column(String)
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String)
    smtp_password = Column(String)
    smtp_from_name = Column(String, default="agenza.ai")
    updated_at = Column(DateTime, default=datetime.utcnow)


class EmailAutomation(Base):
    """
    A recurring email rule, scoped to the signed-in user's Clerk id. See
    scheduler.py for how these get checked and sent.
    """

    __tablename__ = "email_automations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    to_email = Column(String)
    subject = Column(String)
    body = Column(Text)
    frequency = Column(String)  # "hourly" | "daily"
    time_of_day = Column(String, nullable=True)  # "HH:MM", only used when daily
    enabled = Column(Integer, default=1)  # Postgres has bool, but keep 1/0 for a smooth SQLite->PG carryover
    created_at = Column(DateTime, default=datetime.utcnow)
    last_sent_at = Column(DateTime, nullable=True)


class UserUsage(Base):
    """
    A rolling hourly token budget per user, used to rate-limit chat usage.
    `tokens_used` is an approximation (see approx_token_count in app.py) —
    good enough to catch runaway usage without needing a provider-specific
    tokenizer for every model in the registry. The window resets itself the
    next time it's checked after `window_start` is more than an hour old.
    """

    __tablename__ = "user_usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    window_start = Column(DateTime, default=datetime.utcnow)
    tokens_used = Column(Integer, default=0)
    # Lifetime counter — never reset by the rolling hourly window above.
    # Shown to the user as "total tokens used" in the usage popup.
    total_tokens_used = Column(Integer, default=0)
    # Per-user override of the app-wide hourly limit (HOURLY_TOKEN_LIMIT in
    # app.py, 2500 by default). NULL means "use the app-wide default".
    # Set to a specific number to raise (or lower) just this user's cap, or
    # to UNLIMITED_TOKEN_LIMIT (-1) to remove their cap entirely — e.g. for
    # an admin account. Manage this with set_user_token_limit() below.
    token_limit = Column(Integer, nullable=True)


class JobPreferences(Base):
    """
    Per-user job-search preferences, entered through the Settings modal.
    The chat agent reads these automatically whenever the user asks it to
    find jobs, so they never have to restate role/location/etc. in the chat
    itself — only an explicit mention in the message overrides these.
    """

    __tablename__ = "job_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    role = Column(String, default="")  # e.g. "Backend Developer" — required for a search
    location = Column(String, default="")  # e.g. "Bangalore" or "Remote"
    country = Column(String, default="in")  # Adzuna 2-letter country code
    max_days_old = Column(Integer, default=3)  # "jobs from the last N days"
    results_per_page = Column(Integer, default=15)
    min_salary = Column(Integer, nullable=True)
    job_type = Column(String, default="any")  # any | full_time | part_time | contract | permanent
    remote_only = Column(Integer, default=0)  # 1/0
    keywords_exclude = Column(String, default="")  # comma-separated terms to filter out
    updated_at = Column(DateTime, default=datetime.utcnow)


class Resume(Base):
    """
    One parsed resume per user, uploaded through Settings -> Job Search ->
    Resume. `raw_text` is kept alongside the structured fields so the
    resume can be re-parsed later (e.g. after the extraction prompt gets
    better) without asking the user to re-upload it.

    Structured fields are stored as JSON text rather than a JSON column —
    this data is small, read-mostly, and this keeps the same simple-column
    pattern as everywhere else in this file, without needing a JSON-capable
    column type on every backend this might run on.

    Read by agent.py's search_jobs tool (as `resume` in the run config) to
    infer a role when none is given, and by job_scoring.py to score every
    listing's Skills Match / Experience Match against this data.
    """

    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    filename = Column(String, default="")
    raw_text = Column(Text, default="")
    skills_json = Column(Text, default="[]")  # JSON list[str]
    experience_json = Column(Text, default="[]")  # JSON list[{title, company, years, description}]
    education_json = Column(Text, default="[]")  # JSON list[{degree, institution, year}]
    projects_json = Column(Text, default="[]")  # JSON list[{name, description}]
    preferred_roles_json = Column(Text, default="[]")  # JSON list[str], best-fit job titles
    experience_years = Column(Float, nullable=True)  # total years of experience, best estimate
    updated_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)
    _ensure_user_usage_columns()


# Columns added to UserUsage after it was first deployed. Mapped to their
# ALTER TABLE type/default so a single loop can add whichever are missing.
_USER_USAGE_MIGRATIONS = {
    "total_tokens_used": "INTEGER DEFAULT 0",
    "token_limit": "INTEGER",
}


def _ensure_user_usage_columns():
    """
    `Base.metadata.create_all` only creates tables that don't exist yet — it
    never alters an existing table, so columns added to `UserUsage` after it
    was first deployed (total_tokens_used, token_limit) need a one-off
    ALTER TABLE. This runs once at startup and is a no-op for any column
    that's already there.

    Uses SQLAlchemy's `inspect()` instead of a raw PRAGMA/information_schema
    query so this works the same on Postgres (production, e.g. Neon) and
    SQLite (local dev) — `ALTER TABLE ... ADD COLUMN` is valid syntax on
    both.
    """
    try:
        inspector = inspect(engine)
        existing_columns = {col["name"] for col in inspector.get_columns("user_usage")}
        missing = {
            name: ddl for name, ddl in _USER_USAGE_MIGRATIONS.items() if name not in existing_columns
        }
        if missing:
            with engine.begin() as conn:
                for name, ddl in missing.items():
                    conn.exec_driver_sql(f"ALTER TABLE user_usage ADD COLUMN {name} {ddl}")
    except Exception:
        # Table may not exist yet on a brand-new database — create_all above
        # already created it with every column in that case, so it's safe
        # to continue rather than crash startup.
        pass


# ---------------------------------------------------------------------------
# Conversations — every query is scoped to user_id so one signed-in user can
# never read, rename, or delete another user's chats.
# ---------------------------------------------------------------------------


def create_or_update_conversation(user_id: str, thread_id: str, first_message: str | None = None):
    db = SessionLocal()

    try:
        conversation = (
            db.query(Conversation)
            .filter(Conversation.user_id == user_id, Conversation.thread_id == thread_id)
            .first()
        )

        if not conversation:
            title = "New Chat"

            if first_message:
                title = first_message.strip()[:40]
                if len(first_message.strip()) > 40:
                    title += "..."

            conversation = Conversation(
                user_id=user_id,
                thread_id=thread_id,
                title=title,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )

            db.add(conversation)

        else:
            conversation.updated_at = datetime.utcnow()

        db.commit()

    finally:
        db.close()


def get_conversation(user_id: str, thread_id: str):
    """Used to check ownership before returning/mutating a thread."""
    db = SessionLocal()

    try:
        return (
            db.query(Conversation)
            .filter(Conversation.user_id == user_id, Conversation.thread_id == thread_id)
            .first()
        )

    finally:
        db.close()


def list_conversations(user_id: str):
    db = SessionLocal()

    try:
        return (
            db.query(Conversation)
            .filter(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
            .all()
        )

    finally:
        db.close()


def rename_conversation(user_id: str, thread_id: str, title: str):
    db = SessionLocal()

    try:
        conversation = (
            db.query(Conversation)
            .filter(Conversation.user_id == user_id, Conversation.thread_id == thread_id)
            .first()
        )

        if not conversation:
            return None

        conversation.title = title
        conversation.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(conversation)
        return conversation

    finally:
        db.close()


def delete_conversation(user_id: str, thread_id: str):
    db = SessionLocal()

    try:
        db.query(ChatMessage).filter(
            ChatMessage.user_id == user_id, ChatMessage.thread_id == thread_id
        ).delete()

        db.query(Conversation).filter(
            Conversation.user_id == user_id, Conversation.thread_id == thread_id
        ).delete()

        db.commit()

    finally:
        db.close()


def save_chat_message(user_id: str, thread_id: str, role: str, content: str):
    db = SessionLocal()

    try:
        msg = ChatMessage(
            user_id=user_id,
            thread_id=thread_id,
            role=role,
            content=content,
            created_at=datetime.utcnow(),
        )

        db.add(msg)

        conversation = (
            db.query(Conversation)
            .filter(Conversation.user_id == user_id, Conversation.thread_id == thread_id)
            .first()
        )

        if conversation:
            conversation.updated_at = datetime.utcnow()

        db.commit()

    finally:
        db.close()


def get_chat_history(user_id: str, thread_id: str):
    db = SessionLocal()

    try:
        return (
            db.query(ChatMessage)
            .filter(ChatMessage.user_id == user_id, ChatMessage.thread_id == thread_id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Email settings — unchanged shape, just now keyed by the real Clerk user id
# instead of a random id generated in localStorage.
# ---------------------------------------------------------------------------


def get_email_settings(user_id: str):
    db = SessionLocal()

    try:
        return (
            db.query(EmailSettings)
            .filter(EmailSettings.user_id == user_id)
            .first()
        )

    finally:
        db.close()


def save_email_settings(
    user_id: str,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    smtp_from_name: str = "agenza.ai",
):
    db = SessionLocal()

    try:
        settings = (
            db.query(EmailSettings)
            .filter(EmailSettings.user_id == user_id)
            .first()
        )

        if not settings:
            settings = EmailSettings(user_id=user_id)
            db.add(settings)

        settings.smtp_host = smtp_host
        settings.smtp_port = smtp_port
        settings.smtp_user = smtp_user
        # Only overwrite the stored password if a new one was actually sent —
        # lets the frontend re-save host/port/from-name without forcing the
        # user to retype their password every time.
        if smtp_password:
            settings.smtp_password = smtp_password
        settings.smtp_from_name = smtp_from_name
        settings.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(settings)
        return settings

    finally:
        db.close()


def delete_email_settings(user_id: str):
    db = SessionLocal()

    try:
        db.query(EmailSettings).filter(EmailSettings.user_id == user_id).delete()
        db.commit()

    finally:
        db.close()


def create_automation(user_id: str, to_email: str, subject: str, body: str, frequency: str, time_of_day: str | None):
    db = SessionLocal()

    try:
        automation = EmailAutomation(
            user_id=user_id,
            to_email=to_email,
            subject=subject,
            body=body,
            frequency=frequency,
            time_of_day=time_of_day,
            enabled=1,
            created_at=datetime.utcnow(),
        )
        db.add(automation)
        db.commit()
        db.refresh(automation)
        return automation

    finally:
        db.close()


def list_automations(user_id: str):
    db = SessionLocal()

    try:
        return (
            db.query(EmailAutomation)
            .filter(EmailAutomation.user_id == user_id)
            .order_by(EmailAutomation.created_at.desc())
            .all()
        )

    finally:
        db.close()


def set_automation_enabled(user_id: str, automation_id: int, enabled: bool):
    db = SessionLocal()

    try:
        automation = (
            db.query(EmailAutomation)
            .filter(EmailAutomation.id == automation_id, EmailAutomation.user_id == user_id)
            .first()
        )
        if automation:
            automation.enabled = 1 if enabled else 0
            db.commit()
        return automation

    finally:
        db.close()


def delete_automation(user_id: str, automation_id: int):
    db = SessionLocal()

    try:
        db.query(EmailAutomation).filter(
            EmailAutomation.id == automation_id, EmailAutomation.user_id == user_id
        ).delete()
        db.commit()

    finally:
        db.close()


def list_enabled_automations():
    """Used by the background scheduler to find every rule that might be due, across all users."""
    db = SessionLocal()

    try:
        return db.query(EmailAutomation).filter(EmailAutomation.enabled == 1).all()

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Job search preferences — keyed by Clerk user id, same pattern as
# EmailSettings above. Read by agent.py's search_jobs tool at call time.
# ---------------------------------------------------------------------------


def get_job_preferences(user_id: str):
    db = SessionLocal()

    try:
        return (
            db.query(JobPreferences)
            .filter(JobPreferences.user_id == user_id)
            .first()
        )

    finally:
        db.close()


def save_job_preferences(
    user_id: str,
    role: str,
    location: str = "",
    country: str = "in",
    max_days_old: int = 3,
    results_per_page: int = 15,
    min_salary: int | None = None,
    job_type: str = "any",
    remote_only: bool = False,
    keywords_exclude: str = "",
):
    db = SessionLocal()

    try:
        prefs = (
            db.query(JobPreferences)
            .filter(JobPreferences.user_id == user_id)
            .first()
        )

        if not prefs:
            prefs = JobPreferences(user_id=user_id)
            db.add(prefs)

        prefs.role = role
        prefs.location = location
        prefs.country = country or "in"
        prefs.max_days_old = max_days_old
        prefs.results_per_page = results_per_page
        prefs.min_salary = min_salary
        prefs.job_type = job_type
        prefs.remote_only = 1 if remote_only else 0
        prefs.keywords_exclude = keywords_exclude
        prefs.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(prefs)
        return prefs

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Resume — one per user, uploaded through Settings -> Job Search -> Resume.
# Parsed by agent.extract_resume_data at upload time; read back here by
# app.py to thread into the chat agent's run config (same pattern as
# EmailSettings/JobPreferences above) and to power job_scoring.py.
# ---------------------------------------------------------------------------


def get_resume(user_id: str):
    db = SessionLocal()

    try:
        return db.query(Resume).filter(Resume.user_id == user_id).first()

    finally:
        db.close()


def save_resume(
    user_id: str,
    *,
    filename: str = "",
    raw_text: str = "",
    skills: list | None = None,
    experience: list | None = None,
    education: list | None = None,
    projects: list | None = None,
    preferred_roles: list | None = None,
    experience_years: float | None = None,
):
    """Creates or overwrites the signed-in user's single stored resume."""
    db = SessionLocal()

    try:
        resume = db.query(Resume).filter(Resume.user_id == user_id).first()

        if not resume:
            resume = Resume(user_id=user_id)
            db.add(resume)

        resume.filename = filename or ""
        resume.raw_text = raw_text or ""
        resume.skills_json = json.dumps(skills or [])
        resume.experience_json = json.dumps(experience or [])
        resume.education_json = json.dumps(education or [])
        resume.projects_json = json.dumps(projects or [])
        resume.preferred_roles_json = json.dumps(preferred_roles or [])
        resume.experience_years = experience_years
        resume.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(resume)
        return resume

    finally:
        db.close()


def delete_resume(user_id: str) -> bool:
    db = SessionLocal()

    try:
        resume = db.query(Resume).filter(Resume.user_id == user_id).first()
        if not resume:
            return False
        db.delete(resume)
        db.commit()
        return True

    finally:
        db.close()


def resume_to_dict(resume) -> dict | None:
    """
    Deserializes a Resume row into the plain dict shape used both by the
    /resume API response and by the `resume` entry in the chat agent's run
    config. Returns None for "no resume uploaded yet" so callers can do
    `if resume_dict:` instead of checking for a specific sentinel shape.
    """
    if not resume:
        return None

    def _load(raw_json):
        try:
            return json.loads(raw_json or "[]")
        except (TypeError, ValueError):
            return []

    return {
        "filename": resume.filename or "",
        "skills": _load(resume.skills_json),
        "experience": _load(resume.experience_json),
        "education": _load(resume.education_json),
        "projects": _load(resume.projects_json),
        "preferred_roles": _load(resume.preferred_roles_json),
        "experience_years": resume.experience_years,
        "updated_at": resume.updated_at.isoformat() if resume.updated_at else None,
    }
    db = SessionLocal()

    try:
        automation = db.query(EmailAutomation).filter(EmailAutomation.id == automation_id).first()
        if automation:
            automation.last_sent_at = sent_at
            db.commit()

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Per-user hourly token usage — a soft rate limit so one user's heavy usage
# (or a runaway conversation) can't run up the whole app's provider bill.
# ---------------------------------------------------------------------------

# Sentinel stored in `UserUsage.token_limit` meaning "no cap at all" — use
# this for admin accounts via set_user_token_limit(user_id, UNLIMITED_TOKEN_LIMIT).
UNLIMITED_TOKEN_LIMIT = -1


def get_usage_status(user_id: str, default_limit: int, window_seconds: int = 3600):
    """
    Returns (allowed, tokens_used, seconds_until_reset, total_tokens_used,
    effective_limit).

    `default_limit` is the app-wide fallback (HOURLY_TOKEN_LIMIT in app.py).
    If this user has a per-user override set (see set_user_token_limit),
    that's used instead — including UNLIMITED_TOKEN_LIMIT, which always
    reports `allowed=True` regardless of tokens_used. `effective_limit` is
    whichever limit actually applied, so callers (the /usage route, the
    chat-lock check) don't need to know about overrides themselves.

    Also auto-resets the hourly window if it's been more than
    window_seconds since it started — callers don't need a separate
    "reset" step. `total_tokens_used` is a lifetime counter that this
    reset never touches.
    """
    db = SessionLocal()

    try:
        usage = db.query(UserUsage).filter(UserUsage.user_id == user_id).first()
        now = datetime.utcnow()

        if not usage:
            usage = UserUsage(
                user_id=user_id, window_start=now, tokens_used=0, total_tokens_used=0, token_limit=None
            )
            db.add(usage)
            db.commit()
            db.refresh(usage)

        elapsed = (now - usage.window_start).total_seconds()

        if elapsed >= window_seconds:
            usage.window_start = now
            usage.tokens_used = 0
            db.commit()
            elapsed = 0

        seconds_until_reset = max(0, int(window_seconds - elapsed))
        effective_limit = default_limit if usage.token_limit is None else usage.token_limit
        unlimited = effective_limit == UNLIMITED_TOKEN_LIMIT
        allowed = True if unlimited else usage.tokens_used < effective_limit

        return allowed, usage.tokens_used, seconds_until_reset, (usage.total_tokens_used or 0), effective_limit

    finally:
        db.close()


def add_usage(user_id: str, tokens: int):
    """
    Adds to this user's usage counter for the current window, and to their
    lifetime total (which is never reset).
    """
    db = SessionLocal()

    try:
        usage = db.query(UserUsage).filter(UserUsage.user_id == user_id).first()

        if not usage:
            usage = UserUsage(
                user_id=user_id, window_start=datetime.utcnow(), tokens_used=0, total_tokens_used=0, token_limit=None
            )
            db.add(usage)

        spent = max(0, tokens)
        usage.tokens_used = (usage.tokens_used or 0) + spent
        usage.total_tokens_used = (usage.total_tokens_used or 0) + spent
        db.commit()

    finally:
        db.close()


def set_user_token_limit(user_id: str, limit: int | None):
    """
    Manually override one user's hourly token limit. Creates the user's
    usage row if it doesn't exist yet, so this works even before they've
    ever sent a message. Run this from a one-off script or a Python shell —
    there's no admin UI for it yet.

        set_user_token_limit("user_abc123", 10000)               # raise their cap to 10,000
        set_user_token_limit("user_admin1", UNLIMITED_TOKEN_LIMIT)  # no cap at all
        set_user_token_limit("user_abc123", None)                 # back to the app-wide default
    """
    db = SessionLocal()

    try:
        usage = db.query(UserUsage).filter(UserUsage.user_id == user_id).first()

        if not usage:
            usage = UserUsage(
                user_id=user_id, window_start=datetime.utcnow(), tokens_used=0, total_tokens_used=0
            )
            db.add(usage)

        usage.token_limit = limit
        db.commit()

    finally:
        db.close()


def get_user_token_limit(user_id: str) -> int | None:
    """
    Returns this user's raw override (None if they're on the app-wide
    default, or UNLIMITED_TOKEN_LIMIT if their cap has been removed).
    """
    db = SessionLocal()

    try:
        usage = db.query(UserUsage).filter(UserUsage.user_id == user_id).first()
        return usage.token_limit if usage else None

    finally:
        db.close()