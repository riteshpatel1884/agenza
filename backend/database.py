import os
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    DateTime,
    UniqueConstraint,
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


def init_db():
    Base.metadata.create_all(bind=engine)


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


def mark_automation_sent(automation_id: int, sent_at: datetime):
    db = SessionLocal()

    try:
        automation = db.query(EmailAutomation).filter(EmailAutomation.id == automation_id).first()
        if automation:
            automation.last_sent_at = sent_at
            db.commit()

    finally:
        db.close()