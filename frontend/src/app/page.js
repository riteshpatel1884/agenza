"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Sidebar from "../components/Sidebar";
import UsageMeter from "@/components/UsageMeter";
import UsageDetailsModal from "../components/UsageDetailsModal";
import ChatMessage from "../components/ChatMessage";
import ChatInput from "../components/ChatInput";
import ThemeToggle from "../components/ThemeToggle";
import SettingsModal from "../components/SettingsModal";
import {
  fetchConversations,
  fetchHistory,
  fetchUsage,
  streamChat,
  renameConversation,
  deleteConversation,
} from "../lib/api";
import {
  applyAccentColor,
  loadAccentColor,
  saveAccentColor,
  loadChatBackground,
  saveChatBackground,
  backgroundToStyle,
  SIDEBAR_STORAGE_KEY,
} from "../lib/theme";

const SUGGESTIONS = [
  "Search for job openings for me",
  "Automate a daily email for me",
  "What can you help me with?",
];

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds || 0);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function makeThreadId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `thread-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

export default function Home() {
  // isLoaded: Clerk has finished checking the session. isSignedIn should
  // always be true here in practice — middleware.js already redirects
  // signed-out visitors to /sign-in before this page ever renders — but we
  // still guard on isLoaded so we don't fire API calls with a null token
  // during that first instant.
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [threadId, setThreadId] = useState(() => makeThreadId());
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const bottomRef = useRef(null);

  // --- Usage / hourly token budget ----------------------------------------
  // Mirrors the backend's per-user hourly window (see /usage in app.py):
  // once tokens_used reaches the limit, `allowed` goes false and the user
  // is locked out of chat until secondsUntilReset counts down to 0 (a
  // rolling 1-hour cooldown, not a fixed clock time).
  const [usage, setUsage] = useState(null); // { limit, tokens_used, allowed, seconds_until_reset, total_tokens_used }
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [usageModalOpen, setUsageModalOpen] = useState(false);

  // --- Customization state -------------------------------------------------
  const [theme, setTheme] = useState("light");
  const [accentColor, setAccentColor] = useState("#14b8a6");
  const [chatBackground, setChatBackground] = useState({ id: "none", type: "none" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Sidebar collapse is tracked independently of theme, with its own
  // persisted key, so toggling the theme can never affect it.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Separate from the desktop collapse rail: on small screens the sidebar is
  // an off-canvas overlay, opened/closed with its own state (not persisted —
  // it should always start closed on a fresh mobile visit).
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // --- Real mobile viewport height -----------------------------------------
  // Mobile browsers (and in-app/custom-tab browsers like the one in the
  // screenshots) resize their address bar and bottom chrome in and out as
  // you scroll, but plain CSS `100vh`/`h-screen` is locked to the *tallest*
  // state of the page. That's what was pushing the composer down below the
  // fold and hiding the header behind the browser's own UI. We track the
  // actual visible height with the Visual Viewport API (falling back to
  // window.innerHeight) and size the app shell to exactly that, in pixels,
  // so the header and composer are always the fixed top/bottom of what's
  // really on screen and only the message list scrolls. This also keeps the
  // composer pinned just above the on-screen keyboard when it opens.
  const [viewportHeight, setViewportHeight] = useState(null);

  useEffect(() => {
    function updateViewportHeight() {
      const vv = window.visualViewport;
      setViewportHeight(vv ? vv.height : window.innerHeight);
    }
    updateViewportHeight();
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    refreshConversations();
    refreshUsage();

    const savedAccent = loadAccentColor();
    setAccentColor(savedAccent);
    setChatBackground(loadChatBackground());
    const savedCollapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (savedCollapsed) setSidebarCollapsed(savedCollapsed === "true");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Re-apply whenever either the accent color or the theme changes, so the
  // two effects that set them (ThemeToggle's mount effect and the saved-color
  // load above) can fire in either order without leaving stale CSS vars.
  useEffect(() => {
    applyAccentColor(accentColor, theme);
  }, [accentColor, theme]);

  // Re-derive accent CSS vars whenever the theme flips, since the
  // hover/soft/contrast shades differ between light and dark.
  function handleThemeChange(nextTheme) {
    setTheme(nextTheme);
    applyAccentColor(accentColor, nextTheme);
  }

  function handleAccentChange(hex) {
    setAccentColor(hex);
    saveAccentColor(hex);
    applyAccentColor(hex, theme);
  }

  function handleBackgroundChange(bg) {
    setChatBackground(bg);
    saveChatBackground(bg);
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function refreshConversations() {
    try {
      const token = await getToken();
      const data = await fetchConversations(token);
      setConversations(data.conversations || []);
    } catch {
      // Non-fatal — the sidebar just stays empty/stale until the next refresh.
    }
  }

  async function refreshUsage() {
    try {
      const token = await getToken();
      const data = await fetchUsage(token);
      setUsage(data);
      setSecondsLeft(data.seconds_until_reset || 0);
    } catch {
      // Non-fatal — the usage pill just stays stale until the next refresh.
    }
  }

  // Client-side ticking countdown so the "come back in X" message updates
  // every second instead of only when the backend is polled again. Once it
  // hits 0 we re-check with the server to confirm the window actually reset
  // (tokens_used only clears server-side, on the next request).
  useEffect(() => {
    if (!usage || usage.allowed || secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          refreshUsage();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usage, secondsLeft <= 0]);

  function handleNewChat() {
    setThreadId(makeThreadId());
    setMessages([]);
    setErrorMsg("");
  }

  async function handleSelectConversation(id) {
    setThreadId(id);
    setErrorMsg("");
    try {
      const token = await getToken();
      const data = await fetchHistory(token, id);
      setMessages(data.messages || []);
    } catch {
      setErrorMsg("Could not load that conversation.");
    }
  }

  async function handleRenameConversation(id, title) {
    const previous = conversations;
    setConversations((prev) => prev.map((c) => (c.thread_id === id ? { ...c, title } : c)));
    try {
      const token = await getToken();
      await renameConversation(token, id, title);
    } catch {
      setConversations(previous);
      setErrorMsg("Could not rename that conversation.");
    }
  }

  async function handleDeleteConversation(id) {
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.thread_id !== id));
    try {
      const token = await getToken();
      await deleteConversation(token, id);
      if (id === threadId) {
        handleNewChat();
      }
    } catch {
      setConversations(previous);
      setErrorMsg("Could not delete that conversation.");
    }
  }

  async function handleSend(text) {
    if (usage && !usage.allowed) return;

    setErrorMsg("");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    const token = await getToken();

    await streamChat({
      token,
      message: text,
      threadId,
      onToken: (token) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + token };
          return updated;
        });
      },
      onJobs: (jobs, count) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, jobs, jobsCount: count };
          return updated;
        });
      },
      onError: (err) => setErrorMsg(err),
      onDone: () => {
        setIsStreaming(false);
        refreshConversations();
        refreshUsage();
      },
    });
  }

  const chatLocked = Boolean(usage && !usage.allowed);

  const hasCustomBackground = chatBackground?.type && chatBackground.type !== "none";
  const mainStyle = backgroundToStyle(chatBackground);

  // Middleware already redirects signed-out visitors to /sign-in, so this is
  // just the brief flash while Clerk confirms the session client-side.
  if (!isLoaded || !isSignedIn) {
    return <div className="flex h-screen items-center justify-center bg-[var(--bg-canvas)]" />;
  }

  return (
    <div
      className="flex h-dvh h-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]"
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <Sidebar
        conversations={conversations}
        activeThreadId={threadId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-canvas)] px-3 py-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              title="Open sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] md:hidden"
            >
              <MenuIcon />
            </button>
            {sidebarCollapsed && (
              <button
                onClick={toggleSidebarCollapsed}
                title="Expand sidebar"
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] md:flex"
              >
                <PanelIcon />
              </button>
            )}
            <p className="hidden truncate text-[13px] text-[var(--text-muted)] sm:block">
              {messages.length > 0 ? "Chat" : "New chat"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <UsageMeter usage={usage} secondsLeft={secondsLeft} onClick={() => setUsageModalOpen(true)} />
            <button
              onClick={() => setSettingsOpen(true)}
              title="Customize"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <SettingsIcon />
            </button>
            <ThemeToggle onThemeChange={handleThemeChange} />
          </div>
        </header>

        <main className="scroll-theme flex-1 overflow-y-auto overscroll-contain" style={mainStyle}>
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center sm:px-6">
              <h1 className="text-[22px] font-medium tracking-tight text-[var(--text-primary)] sm:text-[26px]">
                What are you working on?
              </h1>
              <p className="mt-2 max-w-sm text-[14px] text-[var(--text-muted)]">
                Ask a question, paste something to work through, or pick a starting point below.
              </p>
              <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4">
              {messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  role={m.role}
                  content={m.content}
                  jobs={m.jobs}
                  jobsCount={m.jobsCount}
                  onBusyBackground={hasCustomBackground}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {(errorMsg || chatLocked) && (
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pb-2 text-[13px] text-[var(--danger)]">
            <AlertIcon />
            {chatLocked
              ? `You've reached your hourly usage limit. Chat unlocks again in ${formatCountdown(secondsLeft)}.`
              : errorMsg}
          </div>
        )}

        <ChatInput onSend={handleSend} disabled={isStreaming || chatLocked} />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        accentColor={accentColor}
        onAccentChange={handleAccentChange}
        chatBackground={chatBackground}
        onBackgroundChange={handleBackgroundChange}
        getToken={getToken}
      />

      <UsageDetailsModal
        open={usageModalOpen}
        onClose={() => setUsageModalOpen(false)}
        usage={usage}
        secondsLeft={secondsLeft}
      />
    </div>
  );
}