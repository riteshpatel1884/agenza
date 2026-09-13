"use client";

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds || 0);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Popup opened by tapping the header's usage pill. The pill itself only
 * shows an abbreviated count (e.g. "1.2k/2.5k") so it stays small — this
 * shows the exact numbers in full (e.g. "2,500" instead of "2.5k"), plus
 * the user's lifetime total token consumption, which the pill never shows
 * at all.
 */
export default function UsageDetailsModal({ open, onClose, usage, secondsLeft }) {
  if (!open || !usage) return null;

  const { limit, tokens_used: tokensUsed, allowed, unlimited, total_tokens_used: totalTokensUsed } = usage;
  const pct = !unlimited && limit ? Math.min(100, Math.round((tokensUsed / limit) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-dropdown)]">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <h2 className="text-[15px] font-medium text-[var(--text-primary)]">Usage</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <p className="text-[12px] text-[var(--text-muted)]">This hour</p>
            {unlimited ? (
              <p className="mt-1 text-[22px] font-medium tabular-nums text-[var(--text-primary)]">
                {tokensUsed.toLocaleString()}
                <span className="text-[14px] font-normal text-[var(--text-muted)]"> tokens · unlimited plan</span>
              </p>
            ) : (
              <>
                <p className="mt-1 text-[22px] font-medium tabular-nums text-[var(--text-primary)]">
                  {tokensUsed.toLocaleString()}
                  <span className="text-[14px] font-normal text-[var(--text-muted)]"> / {limit.toLocaleString()} tokens</span>
                </p>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-soft)]">
                  <div
                    className={`h-full rounded-full ${pct >= 80 ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {!allowed && (
                  <p className="mt-2 text-[12px] text-[var(--danger)]">
                    Limit reached — resets in {formatCountdown(secondsLeft)}.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="border-t border-[var(--border-soft)] pt-4">
            <p className="text-[12px] text-[var(--text-muted)]">Total tokens used, all time</p>
            <p className="mt-1 text-[22px] font-medium tabular-nums text-[var(--text-primary)]">
              {(totalTokensUsed ?? 0).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--border-soft)] px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}