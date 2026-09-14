"""
Secondary job sources, used alongside Adzuna (see jobs.py) via the
aggregator in job_aggregator.py.

RemoteOK and Remotive are both public, keyless JSON APIs — no signup or
credentials needed, they're just called directly. RSS career feeds are
whatever you add yourself via CAREER_RSS_FEEDS in .env.

WHY NOT YC JOBS / WELLFOUND: neither offers a public API today. Wellfound
(formerly AngelList) removed its public jobs API years ago, and Y
Combinator's "Work at a Startup" board has never had one — reaching either
would mean scraping rendered HTML, which is fragile (breaks the moment
their markup changes) and generally against the site's terms of service.
The RSS source below is the practical substitute: most startups (YC ones
included) post through Greenhouse or Lever, and Greenhouse boards publish
a real RSS feed at:

    https://boards.greenhouse.io/<company-slug>.rss

Add as many of those (or any other feed) as you want to CAREER_RSS_FEEDS,
comma-separated, e.g.:

    CAREER_RSS_FEEDS=https://boards.greenhouse.io/stripe.rss,https://boards.greenhouse.io/openai.rss

Requires one extra package: `pip install feedparser`.
"""

import re
from datetime import datetime, timezone

import requests

try:
    import feedparser
except ImportError:  # pragma: no cover
    feedparser = None

_REQUEST_TIMEOUT = 15

# RemoteOK returns a 403 to the default python-requests user agent — a
# browser-like one is enough to get past it.
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; AgenzaJobBot/1.0; +https://agenza.ai)"}


class JobSourceError(Exception):
    """
    Raised when a single secondary source fails or isn't configured. Always
    caught per-source in job_aggregator.py — one flaky/misconfigured source
    should never take down the other four.
    """


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]*>", " ", html or "").strip()


def _matches_keywords(haystack: str, what: str) -> bool:
    """Loose OR-of-words filter — these APIs don't support Adzuna-style
    structured search, so keyword matching happens on our side instead."""
    if not what or not what.strip():
        return True
    terms = [t for t in re.split(r"\s+", what.lower()) if t]
    haystack = haystack.lower()
    return any(t in haystack for t in terms)


def _location_ok(location: str, where: str | None) -> bool:
    if not where or not where.strip():
        return True
    where = where.strip().lower()
    if "remote" in where:
        return True  # these sources are remote-first by nature; don't over-filter
    return where in (location or "").lower()


# ---------------------------------------------------------------------------
# RemoteOK — https://remoteok.com/api
# ---------------------------------------------------------------------------


def fetch_remoteok_jobs(what: str, where: str | None = None, limit: int = 15) -> list[dict]:
    try:
        resp = requests.get("https://remoteok.com/api", headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        raise JobSourceError(f"RemoteOK request failed: {e}")
    except ValueError as e:
        raise JobSourceError(f"RemoteOK returned an unreadable response: {e}")

    # RemoteOK's first array element is a legal/notice blob, not a job —
    # every real job has a "position" field, so filter on that instead of
    # assuming the notice is always at index 0.
    raw_jobs = [item for item in data if isinstance(item, dict) and item.get("position")]

    jobs = []
    for item in raw_jobs:
        title = item.get("position") or ""
        description = _strip_html(item.get("description", ""))
        tags = " ".join(item.get("tags") or [])
        location = item.get("location") or "Remote"

        if not _matches_keywords(f"{title} {description} {tags}", what):
            continue
        if not _location_ok(location, where):
            continue

        jobs.append(
            {
                "title": title,
                "company": item.get("company") or "Unknown company",
                "location": location,
                "description": description[:600],
                "url": item.get("url") or item.get("apply_url") or "",
                "created": item.get("date") or "",
                "salary_min": item.get("salary_min"),
                "salary_max": item.get("salary_max"),
                "contract_type": None,
                "contract_time": "full_time",
                "source": "RemoteOK",
            }
        )
        if len(jobs) >= limit:
            break

    return jobs


# ---------------------------------------------------------------------------
# Remotive — https://remotive.com/api/remote-jobs
# ---------------------------------------------------------------------------


def fetch_remotive_jobs(what: str, where: str | None = None, limit: int = 15) -> list[dict]:
    params = {"search": what.strip()} if what and what.strip() else {}

    try:
        resp = requests.get(
            "https://remotive.com/api/remote-jobs", params=params, headers=_HEADERS, timeout=_REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        raise JobSourceError(f"Remotive request failed: {e}")
    except ValueError as e:
        raise JobSourceError(f"Remotive returned an unreadable response: {e}")

    jobs = []
    for item in data.get("jobs", []):
        location = item.get("candidate_required_location") or "Remote"

        if not _location_ok(location, where):
            continue

        job_type = (item.get("job_type") or "full_time").replace("-", "_")

        jobs.append(
            {
                "title": item.get("title") or "",
                "company": item.get("company_name") or "Unknown company",
                "location": location,
                "description": _strip_html(item.get("description", ""))[:600],
                "url": item.get("url") or "",
                "created": item.get("publication_date") or "",
                "salary_min": None,
                "salary_max": None,
                "contract_type": None,
                "contract_time": job_type,
                "source": "Remotive",
            }
        )
        if len(jobs) >= limit:
            break

    return jobs


# ---------------------------------------------------------------------------
# RSS feeds from company career pages (Greenhouse boards, etc.) — configure
# via CAREER_RSS_FEEDS in .env, comma-separated. Empty by default; simply
# contributes nothing until you add at least one feed URL.
# ---------------------------------------------------------------------------


def fetch_rss_career_jobs(what: str, feed_urls: list[str], limit: int = 15) -> list[dict]:
    if not feed_urls:
        return []

    if feedparser is None:
        raise JobSourceError("The 'feedparser' package isn't installed — run: pip install feedparser")

    jobs = []
    for feed_url in feed_urls:
        feed_url = (feed_url or "").strip()
        if not feed_url:
            continue

        try:
            parsed = feedparser.parse(feed_url)
        except Exception as e:
            raise JobSourceError(f"Could not read RSS feed {feed_url}: {e}")

        if parsed.bozo and not parsed.entries:
            # A malformed feed with zero salvageable entries -- skip it
            # rather than raising and losing every other configured feed.
            continue

        company = (parsed.feed.get("title") or "").replace(" Jobs", "").strip() or "Company"

        for entry in parsed.entries:
            title = entry.get("title", "")
            summary = _strip_html(entry.get("summary", "") or entry.get("description", ""))

            if not _matches_keywords(f"{title} {summary}", what):
                continue

            created = ""
            if entry.get("published_parsed"):
                created = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).isoformat()

            jobs.append(
                {
                    "title": title,
                    "company": company,
                    "location": entry.get("location", "") or "",
                    "description": summary[:600],
                    "url": entry.get("link", ""),
                    "created": created,
                    "salary_min": None,
                    "salary_max": None,
                    "contract_type": None,
                    "contract_time": None,
                    "source": "Career Page",
                }
            )
            if len(jobs) >= limit:
                break

    return jobs