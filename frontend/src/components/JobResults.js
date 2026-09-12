"use client";

import { useMemo, useState } from "react";

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M7 7h10v10" />
    </svg>
  );
}

function timeAgo(isoString) {
  if (!isoString) return "";
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return "";
  const diffHours = Math.max(0, Math.round((Date.now() - then) / 36e5));
  if (diffHours < 24) return diffHours <= 1 ? "1h ago" : `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
}

function formatSalary(min, max) {
  if (!min && !max) return null;
  const fmt = (n) => `${Math.round(n / 1000)}k`;
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}`;
  return fmt(min || max);
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "");
}

export default function JobResults({ jobs, count }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return jobs;
    const q = query.toLowerCase();
    return jobs.filter((j) =>
      [j.title, j.company, j.location].some((field) => (field || "").toLowerCase().includes(q))
    );
  }, [jobs, query]);

  if (!jobs || jobs.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-canvas)] px-3.5 py-3 text-[13px] text-[var(--text-muted)]">
        No matching jobs came back for that search.
      </div>
    );
  }

  return (
    <div className="mt-2 w-full max-w-2xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12px] text-[var(--text-muted)]">
          {typeof count === "number" && count > jobs.length
            ? `Showing ${jobs.length} of ${count} matching jobs`
            : `${jobs.length} job${jobs.length === 1 ? "" : "s"} found`}
        </p>
        {jobs.length > 4 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1">
            <span className="text-[var(--text-faint)]">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter results"
              className="w-28 bg-transparent text-[12px] text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none sm:w-40"
            />
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {filtered.map((job, i) => {
          const salary = formatSalary(job.salary_min, job.salary_max);
          const description = stripHtml(job.description);
          const snippet = description.length > 220 ? `${description.slice(0, 220).trim()}…` : description;

          return (
            <div
              key={`${job.url || job.title}-${i}`}
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">{job.title}</p>
                  <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{job.company}</p>
                </div>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    Apply
                    <ArrowUpRightIcon />
                  </a>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-faint)]">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <LocationIcon />
                    {job.location}
                  </span>
                )}
                {salary && <span>{salary}/yr</span>}
                {job.contract_time && <span className="capitalize">{job.contract_time.replace("_", " ")}</span>}
                {job.created && <span>{timeAgo(job.created)}</span>}
              </div>

              {snippet && (
                <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">{snippet}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}