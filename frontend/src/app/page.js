"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Sidebar from "../components/Sidebar";
import ModelSelector from "../components/ModelSelector";
import ChatMessage from "../components/ChatMessage";
import ChatInput from "../components/ChatInput";
import ThemeToggle from "../components/ThemeToggle";
import SettingsModal from "../components/SettingsModal";
import {
  fetchModels,
  fetchConversations,
  fetchHistory,
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
  "Summarize this document in three bullet points",
  "Help me debug a stack trace",
  "Draft a follow-up email",
  "Explain a concept simply",
];

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

  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [conversations, setConversations] = useState([]);
  const [threadId, setThreadId] = useState(() => makeThreadId());
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const bottomRef = useRef(null);

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

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    fetchModels()
      .then((data) => {
        setModels(data.models || []);
        setSelectedModel(data.default || data.models?.[0]?.id || "");
      })
      .catch(() => setErrorMsg("Could not reach the backend. Is it running on port 8080?"));

    refreshConversations();

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
    setErrorMsg("");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    const token = await getToken();

    await streamChat({
      token,
      message: text,
      threadId,
      model: selectedModel,
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
      },
    });
  }

  const hasCustomBackground = chatBackground?.type && chatBackground.type !== "none";
  const mainStyle = backgroundToStyle(chatBackground);

  // Middleware already redirects signed-out visitors to /sign-in, so this is
  // just the brief flash while Clerk confirms the session client-side.
  if (!isLoaded || !isSignedIn) {
    return <div className="flex h-screen items-center justify-center bg-[var(--bg-canvas)]" />;
  }

  return (
    <div className="flex h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-3 sm:px-6 sm:py-3.5">
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
            <ModelSelector
              models={models}
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={isStreaming}
            />
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

        <main className="scroll-theme flex-1 overflow-y-auto" style={mainStyle}>
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

        {errorMsg && (
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pb-2 text-[13px] text-[var(--danger)]">
            <AlertIcon />
            {errorMsg}
          </div>
        )}

        <ChatInput onSend={handleSend} disabled={isStreaming || !selectedModel} />
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
    </div>
  );
}