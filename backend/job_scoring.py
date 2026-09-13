"""
Job relevance scoring.

Turns each Adzuna listing (as returned by jobs.search_adzuna_jobs) into a
0-100 relevance score against what the signed-in user is looking for —
their saved Job Search preferences, plus their resume if they've uploaded
one (see database.Resume / agent.extract_resume_data).

The score is broken into the same named factors shown in the UI (Role,
Location, Skills, Experience, Salary, Freshness) rather than being a single
opaque number, so a user can see *why* a job scored the way it did. A
factor is only included when there was enough information to score it —
e.g. Skills Match and Experience Match are omitted entirely if the user
hasn't uploaded a resume, rather than showing a misleading 0%.

This is deliberately dependency-free (just `re` and `datetime`) — no LLM
call per job, since scoring can run over dozens of listings per search and
needs to be fast and free.
"""

import re
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Shared text helpers
# ---------------------------------------------------------------------------

_STOPWORDS = {
    "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with",
    "at", "by", "is", "as", "we", "our", "you", "your", "will", "job",
}


def _tokenize(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9+.#]*", (text or "").lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 1}


# ---------------------------------------------------------------------------
# Individual factor scorers — each returns a 0-100 float, or None when there
# wasn't enough information (missing resume, missing salary data, etc.) to
# score that factor at all.
# ---------------------------------------------------------------------------


def _role_match_score(job: dict, role_query: str | None, preferred_roles: list[str]) -> float:
    haystack = _tokenize(f"{job.get('title', '')} {(job.get('description') or '')[:300]}")
    if not haystack:
        return 50.0

    candidates = [c for c in ([role_query] + list(preferred_roles or [])) if c and c.strip()]
    if not candidates:
        return 50.0

    best = 0.0
    for candidate in candidates:
        query_tokens = _tokenize(candidate)
        if not query_tokens:
            continue
        overlap = len(query_tokens & haystack) / len(query_tokens)
        best = max(best, overlap)

    return round(best * 100, 1)


def _location_match_score(job: dict, wanted_location: str | None, remote_only: bool) -> float:
    job_location = (job.get("location") or "").lower()
    wanted = (wanted_location or "").strip().lower()

    if remote_only:
        if "remote" in job_location or "anywhere" in job_location or "work from home" in job_location:
            return 100.0
        return 30.0

    if not wanted:
        return 70.0  # no location preference set -- neutral, don't penalize

    if wanted in job_location or job_location in wanted:
        return 100.0

    if _tokenize(wanted) & _tokenize(job_location):
        return 75.0  # shares a city/region word but isn't an exact match

    return 25.0


def _skills_match_score(job: dict, skills: list[str]) -> float | None:
    if not skills:
        return None

    haystack = f"{job.get('title', '')} {job.get('description', '')}".lower()
    hits = sum(1 for skill in skills if skill and skill.lower() in haystack)
    return round(min(100.0, (hits / len(skills)) * 100), 1)


_SENIORITY_YEARS = {
    "intern": 0, "internship": 0, "entry level": 0.5, "entry-level": 0.5,
    "junior": 1, "associate": 2, "mid level": 3, "mid-level": 3,
    "senior": 5, "sr.": 5, "lead": 7, "staff": 8, "principal": 10, "director": 12,
}

_YEARS_PATTERN = re.compile(r"(\d+)\s*\+?\s*(?:-|to)?\s*(\d+)?\s*\+?\s*year")


def _job_required_years(job: dict) -> float | None:
    text = f"{job.get('title', '')} {job.get('description', '')}".lower()

    match = _YEARS_PATTERN.search(text)
    if match:
        low = float(match.group(1))
        high = float(match.group(2)) if match.group(2) else low
        return (low + high) / 2

    for phrase, years in _SENIORITY_YEARS.items():
        if phrase in text:
            return years

    return None


def _experience_match_score(job: dict, resume_years: float | None) -> float | None:
    if resume_years is None:
        return None

    required = _job_required_years(job)
    if required is None:
        return 80.0  # can't tell what the job wants -- assume a reasonable fit

    diff = abs(resume_years - required)
    if diff <= 0.5:
        return 100.0
    if diff <= 1.5:
        return 90.0
    if diff <= 3:
        return 75.0
    if diff <= 5:
        return 55.0
    return 35.0


def _salary_match_score(job: dict, min_salary: int | None) -> float:
    job_min = job.get("salary_min")
    job_max = job.get("salary_max")

    if not job_min and not job_max:
        return 70.0  # job didn't list a salary -- neutral, don't penalize

    if not min_salary:
        return 85.0  # user has no floor set -- any listed salary is fine

    best_offer = job_max or job_min
    if best_offer >= min_salary:
        return 100.0

    return round(max(0.0, (best_offer / min_salary) * 100), 1)


def _freshness_score(job: dict, max_days_old: int | None) -> float:
    created = job.get("created")
    if not created:
        return 70.0

    try:
        posted = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        if posted.tzinfo is None:
            posted = posted.replace(tzinfo=timezone.utc)
    except ValueError:
        return 70.0

    age_days = max(0.0, (datetime.now(timezone.utc) - posted).total_seconds() / 86400)
    window = max(1, max_days_old or 7)
    return round(max(0.0, 100.0 - (age_days / window) * 100), 1)


# ---------------------------------------------------------------------------
# Combining factors into one overall score
# ---------------------------------------------------------------------------

# How much each factor counts toward the overall score. These sum to 1.0;
# if a factor can't be scored (e.g. no resume => no Skills/Experience score)
# its weight is simply dropped and the rest are renormalized, rather than
# treating the missing factor as a 0.
_WEIGHTS = {
    "role": 0.30,
    "skills": 0.25,
    "experience": 0.15,
    "location": 0.15,
    "salary": 0.10,
    "freshness": 0.05,
}

FACTOR_LABELS = {
    "role": "Role Match",
    "location": "Location Match",
    "skills": "Skills Match",
    "experience": "Experience Match",
    "salary": "Salary Match",
    "freshness": "Freshness",
}


def score_job(
    job: dict,
    *,
    role_query: str | None = None,
    wanted_location: str | None = None,
    remote_only: bool = False,
    min_salary: int | None = None,
    max_days_old: int | None = None,
    resume: dict | None = None,
) -> tuple[int, dict[str, float]]:
    """
    Scores one job dict against the user's search context and resume.

    Returns (overall_score: int 0-100, breakdown: dict[str, float]) where
    breakdown only contains the factors that could actually be scored —
    Skills Match and Experience Match are omitted entirely when `resume`
    is empty, rather than showing a misleading 0%.
    """
    resume = resume or {}
    skills = resume.get("skills") or []
    preferred_roles = resume.get("preferred_roles") or []
    resume_years = resume.get("experience_years")

    raw_breakdown = {
        "role": _role_match_score(job, role_query, preferred_roles),
        "location": _location_match_score(job, wanted_location, remote_only),
        "skills": _skills_match_score(job, skills),
        "experience": _experience_match_score(job, resume_years),
        "salary": _salary_match_score(job, min_salary),
        "freshness": _freshness_score(job, max_days_old),
    }

    weighted_sum = 0.0
    weight_total = 0.0
    for factor, score in raw_breakdown.items():
        if score is None:
            continue
        weight = _WEIGHTS[factor]
        weighted_sum += weight * score
        weight_total += weight

    overall = round(weighted_sum / weight_total) if weight_total else 0
    breakdown = {factor: score for factor, score in raw_breakdown.items() if score is not None}

    return overall, breakdown


def score_and_rank_jobs(jobs: list[dict], **kwargs) -> list[dict]:
    """
    Scores every job in `jobs` and returns a NEW list (originals aren't
    mutated) with `relevance_score` (int) and `score_breakdown` (dict)
    attached to each, sorted best-match-first. Ties keep their original
    relative order (Python's sort is stable), so Adzuna's own date-sorted
    order acts as the tiebreaker.
    """
    scored = []
    for job in jobs:
        overall, breakdown = score_job(job, **kwargs)
        scored.append({**job, "relevance_score": overall, "score_breakdown": breakdown})

    scored.sort(key=lambda j: j["relevance_score"], reverse=True)
    return scored