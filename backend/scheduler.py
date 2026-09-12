from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from database import list_enabled_automations, get_email_settings, mark_automation_sent
from email_utils import send_smtp_email


def _is_due(automation, now: datetime) -> bool:
    if automation.frequency == "hourly":
        return not automation.last_sent_at or (now - automation.last_sent_at) >= timedelta(hours=1)

    if automation.frequency == "daily" and automation.time_of_day:
        try:
            hour, minute = (int(part) for part in automation.time_of_day.split(":"))
        except ValueError:
            return False

        scheduled_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        already_sent_today = automation.last_sent_at and automation.last_sent_at.date() == now.date()
        return now >= scheduled_today and not already_sent_today

    return False


def check_and_send_due_automations():
    """
    Runs on a fixed interval (see start_scheduler). For every enabled
    automation that's due, sends it using that user's saved SMTP settings
    and stamps last_sent_at so it isn't sent again this hour/day.

    Times are evaluated in the server's local time zone — if your Railway
    deployment runs in UTC and a user picks "9:00 AM" expecting their own
    time zone, it'll fire at 9am UTC instead. There's no per-user time zone
    stored yet; see note in the frontend automation form.
    """
    now = datetime.now()

    for automation in list_enabled_automations():
        if not _is_due(automation, now):
            continue

        settings = get_email_settings(automation.user_id)
        if not settings:
            # User removed their email connection after creating this
            # automation — skip silently rather than erroring every tick.
            continue

        send_smtp_email(
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_user,
            settings.smtp_password,
            settings.smtp_from_name,
            automation.to_email,
            automation.subject,
            automation.body,
        )
        mark_automation_sent(automation.id, now)


_scheduler = None


def start_scheduler():
    """Call once at app startup. Safe to call more than once — no-ops after the first."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(check_and_send_due_automations, "interval", minutes=1, id="email_automations")
    _scheduler.start()
    return _scheduler