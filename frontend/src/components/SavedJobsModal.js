"use client";

import { useState } from "react";
import JobDetailsModal from "./JobDetailsModal";

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}

function formatSalary(min, max) {
  if (!min && !max) return null;
  const fmt = (n) => `${Math.round(n / 1000)}k`;
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}`;
  return fmt(min || max);
}

// Same deterministic-per-company palette as JobResults' CompanyAvatar, kept
// as its own small copy here rather than a shared import — this modal only
// needs the avatar, not the rest of that file.
const AVATAR_PALETTE = [
  { bg: "#EEF2FF", fg: "#4338CA" },
  { bg: "#ECFDF5", fg: "#047857" },
  { bg: "#FFF7ED", fg: "#C2410C" },
  { bg: "#FDF2F8", fg: "#BE185D" },
  { bg: "#EFF6FF", fg: "#1D4ED8" },
  { bg: "#F5F3FF", fg: "#6D28D9" },
  { bg: "#FEFCE8", fg: "#A16207" },
  { bg: "#F0FDFA", fg: "#0F766E" },
];

function avatarStyle(name) {
  const str = name || "?";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function CompanyAvatar({ name }) {
  const { bg, fg } = avatarStyle(name);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {initial}
    </div>
  );
}

/**
 * Popup opened from the header's bookmark button, next to the usage pill —
 * lists every job the user has saved from a chat search result (see the
 * bookmark button on each JobCard / JobDetailsModal), most recently saved
 * first. Tapping a row reopens the same JobDetailsModal used in chat, and
 * "Remove" un-saves it via onRemove (wired to DELETE /saved-jobs in
 * page.js).
 */
export default function SavedJobsModal({ open, onClose, jobs, loading, onRemove }) {
  const [selectedJob, setSelectedJob] = useState(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-dropdown)] sm:max-h-[75dvh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <h2 className="text-[15px] font-medium text-[var(--text-primary)]">
            Saved jobs
            {jobs.length > 0 && <span className="ml-1.5 text-[var(--text-faint)]">({jobs.length})</span>}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {loading && <p className="px-2 py-3 text-[13px] text-[var(--text-muted)]">Loading…</p>}

          {!loading && jobs.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="text-[var(--text-faint)]">
                <BookmarkIcon />
              </span>
              <p className="text-[13px] text-[var(--text-muted)]">
                No saved jobs yet — tap the bookmark icon on any job to keep it here.
              </p>
            </div>
          )}

          <ul className="space-y-1.5">
            {jobs.map((job) => {
              const salary = formatSalary(job.salary_min, job.salary_max);
              return (
                <li
                  key={job.job_id}
                  className="group flex items-start gap-2.5 rounded-xl border border-[var(--border-soft)] px-3 py-2.5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedJob(job)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  >
                    <CompanyAvatar name={job.company} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">{job.title}</p>
                      <p className="truncate text-[12.5px] text-[var(--text-muted)]">{job.company}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-[var(--text-faint)]">
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <LocationIcon />
                            {job.location}
                          </span>
                        )}
                        {salary && <span className="font-medium text-[var(--text-muted)]">{salary}/yr</span>}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemove?.(job.job_id)}
                    title="Remove from saved jobs"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-faint)] opacity-100 transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <JobDetailsModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        saved={!!selectedJob}
        onToggleSave={(job) => {
          onRemove?.(job.job_id);
          setSelectedJob(null);
        }}
      />
    </div>
  );
}