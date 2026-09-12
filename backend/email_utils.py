import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_smtp_email(host, port, user, password, from_name, to, subject, body, cc=None):
    """
    Sends one email over SMTP. Returns (ok: bool, message: str) instead of
    raising, so callers (the chat tool, the automation scheduler) can each
    decide how to surface a failure without a shared try/except.
    """
    if not host or not user or not password:
        return False, "Email isn't connected — SMTP host, user, or password is missing."

    cc_list = [addr.strip() for addr in cc.split(",") if addr.strip()] if cc else []

    try:
        msg = MIMEMultipart()
        msg["From"] = f"{from_name} <{user}>"
        msg["To"] = to
        msg["Subject"] = subject
        if cc_list:
            msg["Cc"] = ", ".join(cc_list)
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(host, int(port), timeout=15) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(user, [to] + cc_list, msg.as_string())

        return True, f"Email sent to {to} with subject '{subject}'."

    except smtplib.SMTPAuthenticationError:
        return False, "SMTP login was rejected — check the saved email credentials."
    except Exception as e:
        return False, f"Failed to send email: {e}"