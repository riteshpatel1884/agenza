"""
Thin client around the Adzuna job search API.

Get free credentials at https://developer.adzuna.com/ and set:

    ADZUNA_APP_ID=...
    ADZUNA_APP_KEY=...

in your .env file. Docs: https://developer.adzuna.com/overview
"""

import requests

ADZUNA_BASE_URL = "https://api.adzuna.com/v1/api/jobs"

# Job-type filters Adzuna supports as boolean query params.
_JOB_TYPE_PARAMS = {"full_time", "part_time", "contract", "permanent"}


class JobSearchError(Exception):
    """Raised when Adzuna isn't configured or the request itself fails."""


def search_adzuna_jobs(
    app_id: str | None,
    app_key: str | None,
    what: str,
    where: str | None = None,
    country: str = "in",
    page: int = 1,
    results_per_page: int = 20,
    max_days_old: int | None = None,
    min_salary: int | None = None,
    job_type: str | None = None,
    what_exclude: str | None = None,
):
    """
    Search Adzuna and return (jobs, total_count).

    Each job dict has: title, company, location, description, url, created,
    salary_min, salary_max, contract_type, contract_time.
    """
    if not app_id or not app_key:
        raise JobSearchError(
            "Job search isn't configured on the backend yet — set ADZUNA_APP_ID "
            "and ADZUNA_APP_KEY in the .env file."
        )

    if not what or not what.strip():
        raise JobSearchError("A role or keyword is required to search for jobs.")

    url = f"{ADZUNA_BASE_URL}/{country}/search/{max(page, 1)}"

    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": what.strip(),
        "results_per_page": min(max(int(results_per_page or 20), 1), 50),
        "content-type": "application/json",
        "sort_by": "date",
    }

    if where and where.strip():
        params["where"] = where.strip()
    if max_days_old:
        params["max_days_old"] = int(max_days_old)
    if min_salary:
        params["salary_min"] = int(min_salary)
    if what_exclude and what_exclude.strip():
        params["what_exclude"] = what_exclude.strip()
    if job_type in _JOB_TYPE_PARAMS:
        params[job_type] = 1

    try:
        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        raise JobSearchError(f"Adzuna request failed (HTTP {status}). Check the country code and credentials.")
    except requests.exceptions.RequestException as e:
        raise JobSearchError(f"Could not reach Adzuna: {e}")

    payload = response.json()

    jobs = []
    for item in payload.get("results", []):
        jobs.append(
            {
                "title": (item.get("title") or "").strip(),
                "company": (item.get("company") or {}).get("display_name", "Unknown company"),
                "location": (item.get("location") or {}).get("display_name", ""),
                "description": (item.get("description") or "").strip(),
                "url": item.get("redirect_url", ""),
                "created": item.get("created", ""),
                "salary_min": item.get("salary_min"),
                "salary_max": item.get("salary_max"),
                "contract_type": item.get("contract_type"),
                "contract_time": item.get("contract_time"),
            }
        )

    return jobs, payload.get("count", len(jobs))