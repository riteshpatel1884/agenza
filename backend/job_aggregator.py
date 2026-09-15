# """
# Combines all job sources into one pool: Adzuna (the primary, largest
# catalog), RemoteOK, Remotive, and any RSS career-page feeds you've
# configured. agent.py's search_jobs tool calls search_all_sources() once,
# then runs the combined list through job_scoring.score_and_rank_jobs so
# listings from every source get ranked together on equal footing, rather
# than just concatenating five separately-sorted lists.

# Each source is fetched independently and wrapped in its own try/except —
# one source being down, misconfigured, or rate-limited never blocks the
# others from returning results. Whatever went wrong per-source comes back
# in `source_errors` so the tool can mention it if literally everything
# failed, without spamming the user when only a secondary source hiccuped.
# """

# import os

# from jobs import search_adzuna_jobs, JobSearchError
# from job_sources import (
#     fetch_remoteok_jobs,
#     fetch_remotive_jobs,
#     fetch_rss_career_jobs,
#     JobSourceError,
# )


# def _career_feed_urls() -> list[str]:
#     raw = os.getenv("CAREER_RSS_FEEDS", "")
#     return [url.strip() for url in raw.split(",") if url.strip()]


# def _dedupe(jobs: list[dict]) -> list[dict]:
#     """Drops jobs that share a (title, company) pair, case-insensitive —
#     cheap but effective for the rare case a role gets cross-posted across
#     sources. Keeps the first occurrence, so Adzuna (fetched first) wins."""
#     seen = set()
#     deduped = []
#     for job in jobs:
#         key = (job.get("title", "").strip().lower(), job.get("company", "").strip().lower())
#         if key in seen:
#             continue
#         seen.add(key)
#         deduped.append(job)
#     return deduped


# def search_all_sources(
#     app_id,
#     app_key,
#     what,
#     where=None,
#     country="in",
#     results_per_page=20,
#     max_days_old=None,
#     min_salary=None,
#     job_type=None,
#     what_exclude=None,
# ):
#     """
#     Returns (jobs: list[dict], total_count: int, source_errors: dict[str, str]).

#     `total_count` blends Adzuna's real "total matches" figure with the raw
#     number of hits pulled from the other three sources — those don't expose
#     a total-matching count of their own (RemoteOK/Remotive/RSS just return
#     whatever's currently posted), so the blended number is an honest floor
#     on how much is out there, not an exact total across all five sources.
#     """
#     jobs = []
#     total_count = 0
#     source_errors = {}

#     try:
#         adzuna_jobs, adzuna_total = search_adzuna_jobs(
#             app_id=app_id,
#             app_key=app_key,
#             what=what,
#             where=where,
#             country=country,
#             results_per_page=results_per_page,
#             max_days_old=max_days_old,
#             min_salary=min_salary,
#             job_type=job_type,
#             what_exclude=what_exclude,
#         )
#         for job in adzuna_jobs:
#             job["source"] = "Adzuna"
#         jobs.extend(adzuna_jobs)
#         total_count += adzuna_total
#     except JobSearchError as e:
#         source_errors["Adzuna"] = str(e)

#     # Secondary sources each contribute a smaller slice — they're fetched
#     # to widen coverage (remote-first boards, individual companies' own
#     # postings), not to dominate a search that Adzuna already answers well.
#     secondary_limit = max(5, results_per_page // 3)

#     for name, fetch in (
#         ("RemoteOK", lambda: fetch_remoteok_jobs(what, where, secondary_limit)),
#         ("Remotive", lambda: fetch_remotive_jobs(what, where, secondary_limit)),
#         ("Career Page", lambda: fetch_rss_career_jobs(what, _career_feed_urls(), secondary_limit)),
#     ):
#         try:
#             found = fetch()
#             jobs.extend(found)
#             total_count += len(found)
#         except JobSourceError as e:
#             source_errors[name] = str(e)

#     jobs = _dedupe(jobs)

#     return jobs, total_count, source_errors


"""
Combines all job sources into one pool: Adzuna (the primary, largest
catalog), RemoteOK, Remotive, and any RSS career-page feeds you've
configured. agent.py's search_jobs tool calls search_all_sources() once,
then runs the combined list through job_scoring.score_and_rank_jobs so
listings from every source get ranked together on equal footing, rather
than just concatenating five separately-sorted lists.

Each source is fetched independently and wrapped in its own try/except —
one source being down, misconfigured, or rate-limited never blocks the
others from returning results. Whatever went wrong per-source comes back
in `source_errors` so the tool can mention it if literally everything
failed, without spamming the user when only a secondary source hiccuped.
"""

import os

from jobs import search_adzuna_jobs_paged, JobSearchError
from job_sources import (
    fetch_remoteok_jobs,
    fetch_remotive_jobs,
    fetch_rss_career_jobs,
    JobSourceError,
)


def _career_feed_urls() -> list[str]:
    raw = os.getenv("CAREER_RSS_FEEDS", "")
    return [url.strip() for url in raw.split(",") if url.strip()]


def _dedupe(jobs: list[dict]) -> list[dict]:
    """Drops jobs that share a (title, company) pair, case-insensitive —
    cheap but effective for the rare case a role gets cross-posted across
    sources. Keeps the first occurrence, so Adzuna (fetched first) wins."""
    seen = set()
    deduped = []
    for job in jobs:
        key = (job.get("title", "").strip().lower(), job.get("company", "").strip().lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(job)
    return deduped


def search_all_sources(
    app_id,
    app_key,
    what,
    where=None,
    country="in",
    results_per_page=20,
    max_days_old=None,
    min_salary=None,
    job_type=None,
    what_exclude=None,
):
    """
    Returns (jobs: list[dict], total_count: int, source_errors: dict[str, str]).

    `total_count` blends Adzuna's real "total matches" figure with the raw
    number of hits pulled from the other three sources — those don't expose
    a total-matching count of their own (RemoteOK/Remotive/RSS just return
    whatever's currently posted), so the blended number is an honest floor
    on how much is out there, not an exact total across all five sources.
    """
    jobs = []
    total_count = 0
    source_errors = {}

    try:
        adzuna_jobs, adzuna_total = search_adzuna_jobs_paged(
            app_id=app_id,
            app_key=app_key,
            what=what,
            target_results=results_per_page,
            where=where,
            country=country,
            max_days_old=max_days_old,
            min_salary=min_salary,
            job_type=job_type,
            what_exclude=what_exclude,
        )
        for job in adzuna_jobs:
            job["source"] = "Adzuna"
        jobs.extend(adzuna_jobs)
        total_count += adzuna_total
    except JobSearchError as e:
        source_errors["Adzuna"] = str(e)

    # Secondary sources each contribute a smaller slice — they're fetched
    # to widen coverage (remote-first boards, individual companies' own
    # postings), not to dominate a search that Adzuna already answers well.
    secondary_limit = max(5, results_per_page // 3)

    for name, fetch in (
        ("RemoteOK", lambda: fetch_remoteok_jobs(what, where, secondary_limit)),
        ("Remotive", lambda: fetch_remotive_jobs(what, where, secondary_limit)),
        ("Career Page", lambda: fetch_rss_career_jobs(what, _career_feed_urls(), secondary_limit)),
    ):
        try:
            found = fetch()
            jobs.extend(found)
            total_count += len(found)
        except JobSourceError as e:
            source_errors[name] = str(e)

    jobs = _dedupe(jobs)

    return jobs, total_count, source_errors