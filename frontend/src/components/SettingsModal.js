"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCENT_PRESETS,
  BACKGROUND_PRESETS,
  backgroundToStyle,
  applyAccentColor,
} from "../lib/theme";

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

export default function SettingsModal({
  open,
  onClose,
  theme,
  accentColor,
  onAccentChange,
  chatBackground,
  onBackgroundChange,
}) {
  const [customHex, setCustomHex] = useState(accentColor);
  const [tab, setTab] = useState("accent");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setCustomHex(accentColor);
  }, [accentColor, open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function pickAccent(hex) {
    onAccentChange(hex);
    applyAccentColor(hex, theme);
  }

  function handleCustomHex(value) {
    setCustomHex(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      pickAccent(value);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      onBackgroundChange({ id: "custom", label: "Custom", type: "image", value: reader.result, fit: "cover" });
    };
    reader.readAsDataURL(file);
  }

  const isCustomAccent = !ACCENT_PRESETS.some((p) => p.hex.toLowerCase() === accentColor.toLowerCase());

  // Group background presets by their `group` field (falling back to a single
  // "Backgrounds" bucket for any preset that doesn't specify one), preserving
  // first-seen order so the picker reads Simple -> Doodles -> Nature -> ... .
  const backgroundGroups = Object.entries(
    BACKGROUND_PRESETS.reduce((acc, bg) => {
      const key = bg.group || "Backgrounds";
      (acc[key] = acc[key] || []).push(bg);
      return acc;
    }, {})
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-dropdown)]">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <h2 className="text-[15px] font-medium text-[var(--text-primary)]">Customize Nova</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--border-soft)] px-5 pt-3">
          {[
            { id: "accent", label: "Accent color" },
            { id: "background", label: "Chat background" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                tab === t.id
                  ? "border-b-2 border-[var(--accent)] text-[var(--text-primary)]"
                  : "border-b-2 border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
          {tab === "accent" && (
            <div>
              <p className="mb-3 text-[13px] text-[var(--text-muted)]">
                Pick a color for buttons, links, and highlights across the app.
              </p>
              <div className="grid grid-cols-4 gap-3">
                {ACCENT_PRESETS.map((p) => {
                  const selected = p.hex.toLowerCase() === accentColor.toLowerCase();
                  return (
                    <button
                      key={p.hex}
                      onClick={() => pickAccent(p.hex)}
                      title={p.name}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full transition-shadow"
                        style={{
                          backgroundColor: p.hex,
                          boxShadow: selected ? `0 0 0 2px var(--bg-elevated), 0 0 0 4px ${p.hex}` : "none",
                        }}
                      >
                        {selected && <span style={{ color: "#fff" }}><CheckIcon /></span>}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">{p.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
                <p className="mb-2 text-[13px] font-medium text-[var(--text-primary)]">Custom color</p>
                <div className="flex items-center gap-2.5">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : "#14b8a6"}
                    onChange={(e) => handleCustomHex(e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={customHex}
                    onChange={(e) => handleCustomHex(e.target.value)}
                    placeholder="#14b8a6"
                    spellCheck={false}
                    className={`w-28 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none ${
                      isCustomAccent ? "border-[var(--accent)]" : "border-[var(--border)]"
                    } bg-[var(--bg-canvas)] text-[var(--text-primary)]`}
                  />
                  {isCustomAccent && (
                    <span className="text-[12px] text-[var(--accent-soft-text)]">In use</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "background" && (
            <div>
              <p className="mb-3 text-[13px] text-[var(--text-muted)]">
                Choose a wallpaper for the message area, or upload your own image.
              </p>

              {backgroundGroups.map(([groupName, presets], groupIdx) => (
                <div key={groupName} className={groupIdx > 0 ? "mt-5 border-t border-[var(--border-soft)] pt-4" : ""}>
                  <p className="mb-2.5 text-[12px] font-medium text-[var(--text-muted)]">{groupName}</p>
                  <div className="grid grid-cols-4 gap-3">
                    {presets.map((bg) => {
                      const selected = chatBackground?.id === bg.id;
                      return (
                        <button
                          key={bg.id}
                          onClick={() => onBackgroundChange(bg)}
                          title={bg.label}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <span
                            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border transition-shadow"
                            style={{
                              ...backgroundToStyle(bg),
                              borderColor: selected ? "var(--accent)" : "var(--border)",
                              boxShadow: selected ? "0 0 0 2px var(--accent)" : "none",
                              backgroundColor: backgroundToStyle(bg).backgroundColor || "var(--bg-canvas)",
                            }}
                          >
                            {bg.type === "none" && (
                              <span className="text-[10px] text-[var(--text-faint)]">Aa</span>
                            )}
                            {selected && (
                              <span className="rounded-full bg-black/30 p-0.5 text-white">
                                <CheckIcon />
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)]">{bg.label}</span>
                        </button>
                      );
                    })}

                    {groupIdx === backgroundGroups.length - 1 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload image"
                        className="flex flex-col items-center gap-1.5"
                      >
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 border-dashed text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] ${
                            chatBackground?.type === "image" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"
                          }`}
                        >
                          <UploadIcon />
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">Upload</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />

              {chatBackground?.type === "image" && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--border-soft)] px-3 py-2">
                  <div
                    className="h-8 w-8 shrink-0 rounded-md bg-cover bg-center"
                    style={{ backgroundImage: `url(${chatBackground.value})` }}
                  />
                  <span className="flex-1 text-[13px] text-[var(--text-muted)]">Custom image applied</span>
                  <button
                    onClick={() => onBackgroundChange(BACKGROUND_PRESETS[0])}
                    className="text-[12px] font-medium text-[var(--danger)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
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