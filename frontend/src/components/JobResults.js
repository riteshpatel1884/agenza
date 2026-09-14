"use client";

import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE_OPTIONS = [25, 30];

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

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M2 13h20" />
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

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
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

// Deterministic accent per company so the same company always gets the same
// avatar color across a session, without needing to fetch a real logo.
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

function scoreTierColor(score) {
  if (score >= 85) return "#059669"; // emerald
  if (score >= 60) return "#D97706"; // amber
  return "#9A9CA6"; // faint gray — still a valid match, just not a standout
}

function ScoreRing({ score }) {
  const color = scoreTierColor(score);
  const angle = Math.max(0, Math.min(100, score)) * 3.6;

  return (
    <div
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${color} ${angle}deg, var(--border-soft) 0deg)` }}
      title={`${score}% match`}
    >
      <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--bg-elevated)]">
        <span className="text-[11px] font-semibold" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  );
}

function CompanyAvatar({ name }) {
  const { bg, fg } = avatarStyle(name);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {initial}
    </div>
  );
}

function JobCard({ job }) {
  const salary = formatSalary(job.salary_min, job.salary_max);
  const description = stripHtml(job.description);
  const snippet = description.length > 200 ? `${description.slice(0, 200).trim()}…` : description;
  const hasScore = typeof job.relevance_score === "number";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
      <div className="flex items-start gap-3">
        {hasScore ? <ScoreRing score={job.relevance_score} /> : <CompanyAvatar name={job.company} />}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold text-[var(--text-primary)]">{job.title}</p>
              <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{job.company}</p>
            </div>

            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
              >
                Apply
                <ArrowUpRightIcon />
              </a>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {hasScore && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  color: scoreTierColor(job.relevance_score),
                  backgroundColor: `color-mix(in srgb, ${scoreTierColor(job.relevance_score)} 12%, transparent)`,
                }}
              >
                <SparkIcon />
                {job.relevance_score}% match
              </span>
            )}
            {job.source && (
              <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-faint)]">
                {job.source}
              </span>
            )}
            {job.contract_time && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[11px] font-medium capitalize text-[var(--text-faint)]">
                <BriefcaseIcon />
                {job.contract_time.replace("_", " ")}
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-faint)]">
            {job.location && (
              <span className="flex items-center gap-1">
                <LocationIcon />
                {job.location}
              </span>
            )}
            {salary && <span className="font-medium text-[var(--text-muted)]">{salary}/yr</span>}
            {job.created && (
              <span className="flex items-center gap-1">
                <ClockIcon />
                {timeAgo(job.created)}
              </span>
            )}
          </div>

          {snippet && <p className="mt-2.5 text-[13px] leading-6 text-[var(--text-muted)]">{snippet}</p>}
        </div>
      </div>
    </div>
  );
}

function PageSizeToggle({ pageSize, onChange }) {
  return (
    <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 text-[12px]">
      {PAGE_SIZE_OPTIONS.map((size) => (
        <button
          key={size}
          onClick={() => onChange(size)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            pageSize === size
              ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          {size}/page
        </button>
      ))}
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  // Windowed page numbers: current page ± 1, plus first/last with ellipses
  // so this stays compact even with dozens of pages of results.
  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const items = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push("ellipsis-" + p);
    items.push(p);
    prev = p;
  }

  return (
    <div className="mt-4 flex items-center justify-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-30"
        aria-label="Previous page"
      >
        <ChevronLeftIcon />
      </button>

      {items.map((item) =>
        typeof item === "number" ? (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            className={`flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 text-[12.5px] font-medium transition-colors ${
              item === page
                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {item}
          </button>
        ) : (
          <span key={item} className="px-1 text-[12px] text-[var(--text-faint)]">
            …
          </span>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-30"
        aria-label="Next page"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

export default function JobResults({ jobs, count }) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim()) return jobs;
    const q = query.toLowerCase();
    return jobs.filter((j) =>
      [j.title, j.company, j.location].some((field) => (field || "").toLowerCase().includes(q))
    );
  }, [jobs, query]);

  // Reset to page 1 whenever the visible set changes shape — otherwise a
  // filter/page-size change could strand the user on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  if (!jobs || jobs.length === 0) {
    return (
      <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-canvas)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
        <SearchIcon />
        No matching jobs came back for that search.
      </div>
    );
  }

  const hasScores = jobs.some((j) => typeof j.relevance_score === "number");
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageJobs = filtered.slice(startIdx, startIdx + pageSize);

  return (
    <div className="mt-3 w-full max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-[var(--text-primary)]">
            {filtered.length} job{filtered.length === 1 ? "" : "s"} found
            {typeof count === "number" && count > jobs.length && (
              <span className="font-normal text-[var(--text-muted)]"> ({jobs.length} loaded of {count} total)</span>
            )}
          </p>
          {hasScores && (
            <p className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">Ranked by relevance to your search</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {jobs.length > 4 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1">
              <span className="text-[var(--text-faint)]">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter results"
                className="w-28 bg-transparent text-[12px] text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none sm:w-36"
              />
            </div>
          )}
          <PageSizeToggle pageSize={pageSize} onChange={setPageSize} />
        </div>
      </div>

      <div className="space-y-2.5">
        {pageJobs.map((job, i) => (
          <JobCard key={`${job.url || job.title}-${startIdx + i}`} job={job} />
        ))}
      </div>

      <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />

      {totalPages > 1 && (
        <p className="mt-2 text-center text-[11.5px] text-[var(--text-faint)]">
          Showing {startIdx + 1}–{Math.min(startIdx + pageSize, filtered.length)} of {filtered.length}
        </p>
      )}
    </div>
  );
}