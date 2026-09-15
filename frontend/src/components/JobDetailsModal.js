"use client";

import { useEffect } from "react";

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Same labels the backend uses in job_scoring.FACTOR_LABELS, so the
// breakdown reads consistently wherever it's surfaced.
const FACTOR_LABELS = {
  role: "Role match",
  location: "Location match",
  skills: "Skills match",
  experience: "Experience match",
  salary: "Salary match",
  freshness: "Freshness",
};

function scoreColor(score) {
  if (score >= 85) return "#059669";
  if (score >= 60) return "#D97706";
  return "#9A9CA6";
}

/**
 * Preview popup opened by tapping a job card. Shows the full description
 * and the per-factor relevance breakdown so the user can decide whether a
 * role is worth their time WITHOUT leaving the app — "Apply" here is the
 * only thing that opens the external posting.
 */
export default function JobDetailsModal({ job, onClose }) {
  useEffect(() => {
    if (!job) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [job, onClose]);

  if (!job) return null;

  const salary = formatSalary(job.salary_min, job.salary_max);
  const description = stripHtml(job.description);
  const hasScore = typeof job.relevance_score === "number";
  const breakdown = job.score_breakdown || {};
  const breakdownEntries = Object.entries(breakdown).filter(([, v]) => typeof v === "number");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-dropdown)] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold leading-snug text-[var(--text-primary)]">{job.title}</h2>
            <p className="mt-0.5 text-[13.5px] text-[var(--text-muted)]">{job.company}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-[var(--text-faint)]">
            {job.location && (
              <span className="flex items-center gap-1">
                <LocationIcon />
                {job.location}
              </span>
            )}
            {salary && <span className="font-medium text-[var(--text-muted)]">{salary}/yr</span>}
            {job.contract_time && <span className="capitalize">{job.contract_time.replace("_", " ")}</span>}
            {job.created && (
              <span className="flex items-center gap-1">
                <ClockIcon />
                {timeAgo(job.created)}
              </span>
            )}
            {job.source && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5">via {job.source}</span>
            )}
          </div>

          {hasScore && (
            <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-canvas)] p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] font-medium text-[var(--text-primary)]">Relevance</span>
                <span
                  className="text-[15px] font-semibold tabular-nums"
                  style={{ color: scoreColor(job.relevance_score) }}
                >
                  {job.relevance_score}%
                </span>
              </div>

              {breakdownEntries.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {breakdownEntries.map(([factor, value]) => (
                    <div key={factor} className="flex items-center gap-2.5">
                      <span className="w-[108px] shrink-0 text-[11.5px] text-[var(--text-muted)]">
                        {FACTOR_LABELS[factor] || factor}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-soft)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, value))}%`,
                            backgroundColor: scoreColor(value),
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-faint)]">
                        {Math.round(value)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {description ? (
            <div className="mt-4">
              <p className="mb-1.5 text-[12.5px] font-medium text-[var(--text-primary)]">About this role</p>
              <p className="text-[13.5px] leading-6 text-[var(--text-muted)]">{description}</p>
              <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">
                This is a summary — open the full posting for complete requirements.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[var(--text-muted)]">
              No description was provided for this listing.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-soft)] px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Not interested
          </button>
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              Apply
              <ArrowUpRightIcon />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}