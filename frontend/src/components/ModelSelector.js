"use client";

import { useEffect, useRef, useState } from "react";

function CaretIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function ModelSelector({ models, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = models.find((m) => m.id === value);

  useEffect(() => {
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 sm:gap-2 sm:px-3"
      >
        <span className="max-w-[110px] truncate sm:max-w-[220px]">{selected?.label || "Select model"}</span>
        <span className="shrink-0 text-[var(--text-faint)]">
          <CaretIcon />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-[min(224px,85vw)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-dropdown)]">
          {models.map((m) => {
            const isSelected = m.id === value;
            return (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors ${
                  isSelected
                    ? "bg-[var(--accent-soft)] text-[var(--accent-soft-text)]"
                    : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {m.label}
                {isSelected && <CheckIcon />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}