"use client";

import { useEffect, useRef, useState } from "react";
import { getResume, uploadResume, deleteResume } from "../lib/api";

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.1a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * `getToken` is optional — pass the Clerk `getToken` function (same one
 * used everywhere else, e.g. SettingsModal) so this can upload/check a
 * resume on its own. If it's omitted the paperclip button is simply
 * hidden, so this component still works standalone.
 */
export default function ChatInput({ onSend, disabled, getToken }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);
  const resumeFileInputRef = useRef(null);

  // --- Resume attachment state -------------------------------------------
  // Mirrors the same /resume endpoints Settings > Job Search > Resume uses
  // (see lib/api.js) — uploading here or there updates the same saved
  // resume, since it's just attached to the signed-in user's account and
  // read automatically by the job-search tool on every chat turn.
  const [resume, setResume] = useState(null); // { configured, filename } | null while unknown
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError, setResumeError] = useState("");

  useEffect(() => {
    if (!getToken) return;
    let cancelled = false;
    getToken()
      .then((token) => getResume(token))
      .then((data) => {
        if (!cancelled) setResume(data);
      })
      .catch(() => {
        // Silent — the paperclip button still works for a fresh upload
        // even if we couldn't tell whether one already exists.
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

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

  async function handleResumeFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file || !getToken) return;

    setResumeUploading(true);
    setResumeError("");
    try {
      const token = await getToken();
      const data = await uploadResume(token, file);
      setResume(data);
    } catch (err) {
      setResumeError(err.message || "Could not read that resume.");
    } finally {
      setResumeUploading(false);
    }
  }

  async function handleRemoveResume() {
    if (!getToken) return;
    setResumeUploading(true);
    setResumeError("");
    try {
      const token = await getToken();
      await deleteResume(token);
      setResume({ configured: false });
    } catch {
      setResumeError("Could not remove your resume.");
    } finally {
      setResumeUploading(false);
    }
  }

  const canSend = value.trim().length > 0 && !disabled;
  const resumeAttached = resume?.configured;

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl px-4 pb-4">
      {getToken && (
        <input
          ref={resumeFileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={handleResumeFileChange}
          className="hidden"
        />
      )}

      {getToken && resumeAttached && (
        <div className="mb-2 flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] py-1 pl-2.5 pr-1.5 text-[12px] text-[var(--text-muted)] w-fit">
          <FileTextIcon />
          <span className="max-w-[160px] truncate">{resume.filename || "Resume"}</span>
          <button
            type="button"
            onClick={handleRemoveResume}
            disabled={resumeUploading}
            title="Remove resume"
            className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {resumeError && <p className="mb-1.5 text-[12px] text-[var(--danger)]">{resumeError}</p>}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[var(--shadow-elevated)] focus-within:border-[var(--accent)]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          disabled={disabled}
          className="max-h-40 w-full resize-none bg-transparent text-[15px] leading-6 text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getToken && (
              <button
                type="button"
                onClick={() => resumeFileInputRef.current?.click()}
                disabled={resumeUploading}
                title={resumeAttached ? "Replace resume" : "Attach resume — used to rank job search results"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <PaperclipIcon />
              </button>
            )}
            <p className="hidden text-[12px] text-[var(--text-muted)] sm:block">
              {resumeUploading ? "Reading your resume…" : "Enter to send, Shift + Enter for a new line"}
            </p>
          </div>
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