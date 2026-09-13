"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCENT_PRESETS,
  BACKGROUND_PRESETS,
  backgroundToStyle,
  applyAccentColor,
} from "../lib/theme";
import {
  getEmailSettings,
  saveEmailSettings,
  deleteEmailSettings,
  listAutomations,
  createAutomation,
  setAutomationEnabled,
  deleteAutomation,
  getJobPreferences,
  saveJobPreferences,
} from "../lib/api";

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

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M2 13h20" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
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
  getToken,
}) {
  const [customHex, setCustomHex] = useState(accentColor);
  // Top-level tabs are kept to 3 (Appearance / Email / Job Search) so they
  // all fit on a narrow mobile screen without any of them being pushed off
  // and hidden — Accent color + Chat background live together under
  // "Appearance", and Email + Automate live together under "Email", each
  // split by a small sub-tab toggle instead of their own top-level tab.
  const [tab, setTab] = useState("appearance");
  const [appearanceSubTab, setAppearanceSubTab] = useState("accent"); // "accent" | "background"
  const [emailSubTab, setEmailSubTab] = useState("connect"); // "connect" | "automate"
  const fileInputRef = useRef(null);

  // --- Email settings state -------------------------------------------
  const [emailStatus, setEmailStatus] = useState(null); // null = loading
  const [emailForm, setEmailForm] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_from_name: "",
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSavedNote, setEmailSavedNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmailError("");
    setEmailSavedNote("");
    getToken()
      .then((token) => getEmailSettings(token))
      .then((data) => {
        setEmailStatus(data);
        if (data.configured) {
          setEmailForm({
            smtp_host: data.smtp_host || "",
            smtp_port: String(data.smtp_port || "587"),
            smtp_user: data.smtp_user || "",
            smtp_password: "",
            smtp_from_name: data.smtp_from_name || "",
          });
        }
      })
      .catch(() => setEmailError("Could not load email settings."));
  }, [open, getToken]);

  async function handleSaveEmail(e) {
    e.preventDefault();
    setEmailSaving(true);
    setEmailError("");
    setEmailSavedNote("");
    try {
      const token = await getToken();
      await saveEmailSettings(token, emailForm);
      const refreshed = await getEmailSettings(token);
      setEmailStatus(refreshed);
      setEmailForm((f) => ({ ...f, smtp_password: "" }));
      setEmailSavedNote("Email connected.");
    } catch (err) {
      setEmailError(err.message || "Could not save email settings.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleDisconnectEmail() {
    setEmailSaving(true);
    setEmailError("");
    try {
      const token = await getToken();
      await deleteEmailSettings(token);
      setEmailStatus({ configured: false });
      setEmailForm({ smtp_host: "", smtp_port: "587", smtp_user: "", smtp_password: "", smtp_from_name: "" });
      setEmailSavedNote("");
    } catch {
      setEmailError("Could not disconnect email.");
    } finally {
      setEmailSaving(false);
    }
  }

  // --- Automation state --------------------------------------------------
  const [automations, setAutomations] = useState(null); // null = loading
  const [automationForm, setAutomationForm] = useState({
    to_email: "",
    subject: "",
    body: "",
    frequency: "daily",
    time_of_day: "09:00",
  });
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationError, setAutomationError] = useState("");

  useEffect(() => {
    if (!open || tab !== "email" || emailSubTab !== "automate") return;
    getToken()
      .then((token) => listAutomations(token))
      .then((data) => setAutomations(data.automations || []))
      .catch(() => setAutomationError("Could not load automations."));
  }, [open, getToken, tab, emailSubTab]);

  async function handleCreateAutomation(e) {
    e.preventDefault();
    setAutomationSaving(true);
    setAutomationError("");
    try {
      const payload = { ...automationForm };
      if (payload.frequency === "hourly") delete payload.time_of_day;
      const token = await getToken();
      const created = await createAutomation(token, payload);
      setAutomations((prev) => [created, ...(prev || [])]);
      setAutomationForm({ to_email: "", subject: "", body: "", frequency: "daily", time_of_day: "09:00" });
    } catch (err) {
      setAutomationError(err.message || "Could not create automation.");
    } finally {
      setAutomationSaving(false);
    }
  }

  async function handleToggleAutomation(automation) {
    const nextEnabled = !automation.enabled;
    setAutomations((prev) => prev.map((a) => (a.id === automation.id ? { ...a, enabled: nextEnabled } : a)));
    try {
      const token = await getToken();
      await setAutomationEnabled(token, automation.id, nextEnabled);
    } catch {
      setAutomations((prev) => prev.map((a) => (a.id === automation.id ? { ...a, enabled: automation.enabled } : a)));
      setAutomationError("Could not update that automation.");
    }
  }

  async function handleDeleteAutomation(automationId) {
    const previous = automations;
    setAutomations((prev) => prev.filter((a) => a.id !== automationId));
    try {
      const token = await getToken();
      await deleteAutomation(token, automationId);
    } catch {
      setAutomations(previous);
      setAutomationError("Could not delete that automation.");
    }
  }

  // --- Job search preferences state --------------------------------------
  const JOB_DEFAULTS = {
    role: "",
    location: "",
    country: "in",
    max_days_old: 3,
    results_per_page: 15,
    min_salary: "",
    job_type: "any",
    remote_only: false,
    keywords_exclude: "",
  };
  const [jobPrefs, setJobPrefs] = useState(JOB_DEFAULTS);
  const [jobPrefsLoaded, setJobPrefsLoaded] = useState(false);
  const [jobPrefsSaving, setJobPrefsSaving] = useState(false);
  const [jobPrefsError, setJobPrefsError] = useState("");
  const [jobPrefsSavedNote, setJobPrefsSavedNote] = useState("");

  useEffect(() => {
    if (!open || tab !== "jobs") return;
    setJobPrefsError("");
    setJobPrefsSavedNote("");
    getToken()
      .then((token) => getJobPreferences(token))
      .then((data) => {
        if (data.configured) {
          setJobPrefs({
            role: data.role || "",
            location: data.location || "",
            country: data.country || "in",
            max_days_old: data.max_days_old ?? 3,
            results_per_page: data.results_per_page ?? 15,
            min_salary: data.min_salary ?? "",
            job_type: data.job_type || "any",
            remote_only: !!data.remote_only,
            keywords_exclude: data.keywords_exclude || "",
          });
        }
        setJobPrefsLoaded(true);
      })
      .catch(() => setJobPrefsError("Could not load job preferences."));
  }, [open, getToken, tab]);

  async function handleSaveJobPrefs(e) {
    e.preventDefault();
    setJobPrefsSaving(true);
    setJobPrefsError("");
    setJobPrefsSavedNote("");
    try {
      const token = await getToken();
      await saveJobPreferences(token, jobPrefs);
      setJobPrefsSavedNote("Job preferences saved. Just ask in chat — e.g. \"show me jobs from the last 2 days\".");
    } catch (err) {
      setJobPrefsError(err.message || "Could not save job preferences.");
    } finally {
      setJobPrefsSaving(false);
    }
  }

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
            { id: "appearance", label: "Appearance" },
            { id: "email", label: "Email" },
            { id: "jobs", label: "Job Search" },
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
          {tab === "appearance" && (
            <div className="mb-4 flex gap-1.5 rounded-lg bg-[var(--bg-canvas)] p-1">
              {[
                { id: "accent", label: "Accent color" },
                { id: "background", label: "Chat background" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAppearanceSubTab(t.id)}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    appearanceSubTab === t.id
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {tab === "email" && (
            <div className="mb-4 flex gap-1.5 rounded-lg bg-[var(--bg-canvas)] p-1">
              {[
                { id: "connect", label: "Connect" },
                { id: "automate", label: "Automate" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEmailSubTab(t.id)}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    emailSubTab === t.id
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {tab === "appearance" && appearanceSubTab === "accent" && (
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

          {tab === "appearance" && appearanceSubTab === "background" && (
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

          {tab === "email" && emailSubTab === "connect" && (
            <div>
              <p className="mb-3 text-[13px] text-[var(--text-muted)]">
                Connect an inbox so the assistant can send emails for you when you ask it to.
              </p>

              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-canvas)] px-3 py-2.5">
                <span className="mt-0.5 text-[var(--text-muted)]"><LockIcon /></span>
                <p className="text-[12px] leading-5 text-[var(--text-muted)]">
                  Your credentials are stored only in this app's own database, on this server —
                  they're never sent to the AI model or shared with any third party.
                </p>
              </div>

              {emailStatus === null && (
                <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
              )}

              {emailStatus?.configured && (
                <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-[var(--border-soft)] bg-[var(--accent-soft)] px-3 py-2.5">
                  <span className="text-[var(--accent-soft-text)]"><MailIcon /></span>
                  <span className="flex-1 text-[13px] text-[var(--accent-soft-text)]">
                    Connected as {emailStatus.smtp_user}
                  </span>
                  <button
                    type="button"
                    onClick={handleDisconnectEmail}
                    disabled={emailSaving}
                    className="text-[12px] font-medium text-[var(--danger)] hover:underline disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {emailStatus !== null && (
                <form onSubmit={handleSaveEmail} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">SMTP host</label>
                    <input
                      type="text"
                      required
                      value={emailForm.smtp_host}
                      onChange={(e) => setEmailForm((f) => ({ ...f, smtp_host: e.target.value }))}
                      placeholder="smtp.gmail.com"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="w-24 shrink-0">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">Port</label>
                      <input
                        type="number"
                        required
                        value={emailForm.smtp_port}
                        onChange={(e) => setEmailForm((f) => ({ ...f, smtp_port: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">From name</label>
                      <input
                        type="text"
                        value={emailForm.smtp_from_name}
                        onChange={(e) => setEmailForm((f) => ({ ...f, smtp_from_name: e.target.value }))}
                        placeholder="agenza.ai"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">Email address</label>
                    <input
                      type="email"
                      required
                      value={emailForm.smtp_user}
                      onChange={(e) => setEmailForm((f) => ({ ...f, smtp_user: e.target.value }))}
                      placeholder="you@gmail.com"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                      {emailStatus.configured ? "New password (leave blank to keep current)" : "App password"}
                    </label>
                    <input
                      type="password"
                      required={!emailStatus.configured}
                      value={emailForm.smtp_password}
                      onChange={(e) => setEmailForm((f) => ({ ...f, smtp_password: e.target.value }))}
                      placeholder="••••••••••••••••"
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                    <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                      For Gmail, use a 16-character app password, not your regular password.
                    </p>
                  </div>

                  {emailError && <p className="text-[12px] text-[var(--danger)]">{emailError}</p>}
                  {emailSavedNote && <p className="text-[12px] text-[var(--accent-soft-text)]">{emailSavedNote}</p>}

                  <button
                    type="submit"
                    disabled={emailSaving}
                    className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {emailSaving ? "Saving…" : emailStatus.configured ? "Update email settings" : "Connect email"}
                  </button>
                </form>
              )}
            </div>
          )}

          {tab === "email" && emailSubTab === "automate" && (
            <div>
              <p className="mb-3 text-[13px] text-[var(--text-muted)]">
                Set up an email that sends itself on a schedule — every hour, or once a day at a set time.
              </p>

              {!emailStatus?.configured && (
                <p className="mb-4 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-canvas)] px-3 py-2.5 text-[12px] text-[var(--text-muted)]">
                  Connect your email in the Connect tab first — automations need somewhere to send from.
                </p>
              )}

              <form onSubmit={handleCreateAutomation} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">To</label>
                  <input
                    type="email"
                    required
                    disabled={!emailStatus?.configured}
                    value={automationForm.to_email}
                    onChange={(e) => setAutomationForm((f) => ({ ...f, to_email: e.target.value }))}
                    placeholder="someone@example.com"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">Subject</label>
                  <input
                    type="text"
                    required
                    disabled={!emailStatus?.configured}
                    value={automationForm.subject}
                    onChange={(e) => setAutomationForm((f) => ({ ...f, subject: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">Body</label>
                  <textarea
                    required
                    rows={3}
                    disabled={!emailStatus?.configured}
                    value={automationForm.body}
                    onChange={(e) => setAutomationForm((f) => ({ ...f, body: e.target.value }))}
                    className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">Frequency</label>
                    <select
                      disabled={!emailStatus?.configured}
                      value={automationForm.frequency}
                      onChange={(e) => setAutomationForm((f) => ({ ...f, frequency: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                    >
                      <option value="hourly">Every hour</option>
                      <option value="daily">Once a day</option>
                    </select>
                  </div>
                  {automationForm.frequency === "daily" && (
                    <div className="w-32">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">Time</label>
                      <input
                        type="time"
                        disabled={!emailStatus?.configured}
                        value={automationForm.time_of_day}
                        onChange={(e) => setAutomationForm((f) => ({ ...f, time_of_day: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-faint)]">
                  Times run on the server's clock, not your device's local time zone.
                </p>

                {automationError && <p className="text-[12px] text-[var(--danger)]">{automationError}</p>}

                <button
                  type="submit"
                  disabled={automationSaving || !emailStatus?.configured}
                  className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {automationSaving ? "Creating…" : "Create automation"}
                </button>
              </form>

              <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
                <p className="mb-2.5 text-[12px] font-medium text-[var(--text-muted)]">Active automations</p>

                {automations === null && (
                  <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
                )}
                {automations?.length === 0 && (
                  <p className="text-[13px] text-[var(--text-muted)]">No automations yet.</p>
                )}

                <ul className="space-y-2">
                  {automations?.map((a) => (
                    <li key={a.id} className="rounded-lg border border-[var(--border-soft)] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{a.subject}</p>
                          <p className="truncate text-[12px] text-[var(--text-muted)]">To {a.to_email}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-faint)]">
                            <ClockIcon />
                            {a.frequency === "hourly" ? "Every hour" : `Daily at ${a.time_of_day}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleAutomation(a)}
                            title={a.enabled ? "Pause" : "Resume"}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              a.enabled
                                ? "bg-[var(--accent-soft)] text-[var(--accent-soft-text)]"
                                : "bg-[var(--bg-hover)] text-[var(--text-muted)]"
                            }`}
                          >
                            {a.enabled ? "On" : "Off"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAutomation(a.id)}
                            title="Delete"
                            className="text-[11px] font-medium text-[var(--danger)] hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === "jobs" && (
            <div>
              <p className="mb-3 flex items-start gap-2 text-[13px] text-[var(--text-muted)]">
                <span className="mt-0.5 text-[var(--text-faint)]"><BriefcaseIcon /></span>
                Save what you're looking for once, then just ask in chat — "show me jobs from the last 2 days"
                or "any new backend roles" — and Nova pulls matching listings using these preferences.
              </p>

              {!jobPrefsLoaded && !jobPrefsError && (
                <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
              )}

              {(jobPrefsLoaded || jobPrefsError) && (
                <form onSubmit={handleSaveJobPrefs} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                      Role / keywords
                    </label>
                    <input
                      type="text"
                      required
                      value={jobPrefs.role}
                      onChange={(e) => setJobPrefs((f) => ({ ...f, role: e.target.value }))}
                      placeholder="e.g. Backend Developer"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                        Location
                      </label>
                      <input
                        type="text"
                        disabled={jobPrefs.remote_only}
                        value={jobPrefs.location}
                        onChange={(e) => setJobPrefs((f) => ({ ...f, location: e.target.value }))}
                        placeholder="e.g. Bangalore"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </div>
                    <div className="w-24">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                        Country
                      </label>
                      <input
                        type="text"
                        value={jobPrefs.country}
                        onChange={(e) => setJobPrefs((f) => ({ ...f, country: e.target.value.toLowerCase() }))}
                        placeholder="in"
                        maxLength={2}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-[13px] text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={jobPrefs.remote_only}
                      onChange={(e) => setJobPrefs((f) => ({ ...f, remote_only: e.target.checked }))}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    Remote only
                  </label>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                        Job type
                      </label>
                      <select
                        value={jobPrefs.job_type}
                        onChange={(e) => setJobPrefs((f) => ({ ...f, job_type: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      >
                        <option value="any">Any</option>
                        <option value="full_time">Full-time</option>
                        <option value="part_time">Part-time</option>
                        <option value="contract">Contract</option>
                        <option value="permanent">Permanent</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                        Min. salary
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={jobPrefs.min_salary}
                        onChange={(e) => setJobPrefs((f) => ({ ...f, min_salary: e.target.value }))}
                        placeholder="Optional"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                        Default day range
                      </label>
                      <select
                        value={jobPrefs.max_days_old}
                        onChange={(e) => setJobPrefs((f) => ({ ...f, max_days_old: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      >
                        <option value={1}>Last 24 hours</option>
                        <option value={2}>Last 2 days</option>
                        <option value={3}>Last 3 days</option>
                        <option value={7}>Last week</option>
                        <option value={14}>Last 2 weeks</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                        Results per search
                      </label>
                      <select
                        value={jobPrefs.results_per_page}
                        onChange={(e) => setJobPrefs((f) => ({ ...f, results_per_page: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      >
                        <option value={10}>10</option>
                        <option value={15}>15</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
                      Exclude keywords
                    </label>
                    <input
                      type="text"
                      value={jobPrefs.keywords_exclude}
                      onChange={(e) => setJobPrefs((f) => ({ ...f, keywords_exclude: e.target.value }))}
                      placeholder="e.g. senior, internship"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {jobPrefsError && <p className="text-[12px] text-[var(--danger)]">{jobPrefsError}</p>}
                  {jobPrefsSavedNote && <p className="text-[12px] text-[var(--accent-soft-text)]">{jobPrefsSavedNote}</p>}

                  <button
                    type="submit"
                    disabled={jobPrefsSaving}
                    className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {jobPrefsSaving ? "Saving…" : "Save job preferences"}
                  </button>
                </form>
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