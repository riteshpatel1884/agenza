"use client";

import { useEffect, useRef, useState } from "react";

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl px-4 pb-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[var(--shadow-elevated)] focus-within:border-[var(--accent)]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Nova"
          rows={1}
          disabled={disabled}
          className="max-h-40 w-full resize-none bg-transparent text-[15px] leading-6 text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[12px] text-[var(--text-muted)]">Enter to send, Shift + Enter for a new line</p>
          <button
            type="submit"
            disabled={!canSend}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
              canSend
                ? "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                : "bg-[var(--border-soft)] text-[var(--text-faint)]"
            }`}
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>
    </form>
  );
}