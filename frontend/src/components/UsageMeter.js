"use client";

function BoltIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6Z" />
    </svg>
  );
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds || 0);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCompact(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Small pill showing "tokens used / hourly limit". Turns into a countdown
 * once the user has hit their hourly budget (see /usage in app.py) — the
 * same rolling window that also blocks /chat/stream server-side, so this
 * is just making that existing 1-hour cooldown visible instead of letting
 * the user find out only when a message fails.
 */
export default function UsageMeter({ usage, secondsLeft }) {
  if (!usage) return null;

  const { limit, tokens_used: tokensUsed, allowed } = usage;
  const pct = limit ? Math.min(100, Math.round((tokensUsed / limit) * 100)) : 0;

  if (!allowed) {
    return (
      <div
        title="Hourly usage limit reached"
        className="flex items-center gap-1.5 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-2.5 py-1.5 text-[12px] font-medium text-[var(--danger)]"
      >
        <BoltIcon />
        <span className="hidden sm:inline">Limit reached · resets in</span>
        <span className="tabular-nums">{formatCountdown(secondsLeft)}</span>
      </div>
    );
  }

  const nearLimit = pct >= 80;

  return (
    <div
      title={`${tokensUsed.toLocaleString()} / ${limit.toLocaleString()} tokens used this hour`}
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] font-medium sm:px-2.5 ${
        nearLimit
          ? "border-[var(--danger)]/40 text-[var(--danger)]"
          : "border-[var(--border)] text-[var(--text-muted)]"
      }`}
    >
      <BoltIcon />
      <span className="tabular-nums">
        <span className="sm:hidden">{formatCompact(tokensUsed)}/{formatCompact(limit)}</span>
        <span className="hidden sm:inline">
          {tokensUsed.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </span>
    </div>
  );
}