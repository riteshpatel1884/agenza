"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
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

export default function Sidebar({
  conversations,
  activeThreadId,
  onSelect,
  onNewChat,
  collapsed,
  onToggleCollapsed,
  onRenameConversation,
  onDeleteConversation,
  mobileOpen,
  onCloseMobile,
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const editInputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = query.toLowerCase();
    return conversations.filter((c) => (c.title || "New chat").toLowerCase().includes(q));
  }, [conversations, query]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Close the mobile overlay automatically if the viewport grows past the
  // mobile breakpoint while it's open (e.g. rotating a tablet).
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) onCloseMobile?.();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [onCloseMobile]);

  function startEditing(conv) {
    setConfirmingId(null);
    setEditingId(conv.thread_id);
    setDraftTitle(conv.title || "New chat");
  }

  function commitEditing() {
    const trimmed = draftTitle.trim();
    if (editingId && trimmed) {
      onRenameConversation?.(editingId, trimmed);
    }
    setEditingId(null);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  function handlePick(id) {
    onSelect(id);
    onCloseMobile?.();
  }

  function handleNewChat() {
    onNewChat();
    onCloseMobile?.();
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[82%] max-w-[300px] shrink-0 flex-col overflow-hidden bg-[#14141A] text-[#ECEDF2] transition-all duration-200 ease-out md:static md:z-auto md:max-w-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "md:w-0" : "md:w-72"}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-4">
          <div className="flex items-center gap-2">
            
            <span className="text-[14px] font-medium tracking-tight text-[#ECEDF2]">LeaderLab</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleCollapsed}
              title="Collapse sidebar"
              className="hidden h-7 w-7 items-center justify-center rounded-lg text-[#9A9CA6] transition-colors hover:bg-white/[0.08] hover:text-[#ECEDF2] md:flex"
            >
              <PanelIcon />
            </button>
            <button
              onClick={onCloseMobile}
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9A9CA6] transition-colors hover:bg-white/[0.08] hover:text-[#ECEDF2] md:hidden"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="px-3">
          <button
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 py-2 text-[13px] font-medium text-[#ECEDF2] transition-colors hover:bg-white/[0.06] active:bg-white/[0.1]"
          >
            <PlusIcon />
            New chat
          </button>
        </div>

        <div className="mt-4 px-3">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[#8B8D98] focus-within:bg-white/[0.08]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full bg-transparent text-[13px] text-[#ECEDF2] placeholder-[#6B6D76] outline-none"
            />
          </div>
        </div>

        <div className="scroll-dark mt-3 flex-1 overflow-y-auto px-2 pb-4">
          <p className="px-2.5 pb-1.5 pt-3 text-[12px] text-[#6B6D76]">Recent</p>

          {filtered.length === 0 && (
            <p className="px-2.5 py-3 text-[13px] text-[#6B6D76]">
              {query ? "No chats match that search." : "No conversations yet."}
            </p>
          )}

          <ul className="space-y-0.5">
            {filtered.map((conv) => {
              const active = conv.thread_id === activeThreadId;
              const isEditing = editingId === conv.thread_id;
              const isConfirming = confirmingId === conv.thread_id;

              if (isConfirming) {
                return (
                  <li key={conv.thread_id} className="rounded-lg bg-white/[0.06] px-3 py-2">
                    <p className="truncate text-[12.5px] text-[#ECEDF2]">Delete this chat?</p>
                    <div className="mt-1.5 flex gap-2">
                      <button
                        onClick={() => {
                          onDeleteConversation?.(conv.thread_id);
                          setConfirmingId(null);
                        }}
                        className="rounded-md bg-[var(--danger)] px-2.5 py-1 text-[12px] font-medium text-white"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-[#ECEDF2] hover:bg-white/[0.06]"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={conv.thread_id} className="group relative">
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                  )}

                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={commitEditing}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEditing();
                        if (e.key === "Escape") cancelEditing();
                      }}
                      className="block w-full rounded-lg border border-white/20 bg-white/[0.08] px-3 py-1.5 text-[13px] text-[#ECEDF2] outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => handlePick(conv.thread_id)}
                      title={conv.title}
                      className={`flex w-full items-center rounded-lg py-2 pl-3 pr-1.5 text-left text-[13px] transition-colors ${
                        active ? "bg-white/[0.08] text-[#ECEDF2]" : "text-[#9A9CA6] hover:bg-white/[0.05] hover:text-[#ECEDF2]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{conv.title || "New chat"}</span>
                      <span className="ml-1 flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(conv);
                          }}
                          title="Rename"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[#9A9CA6] hover:bg-white/[0.1] hover:text-[#ECEDF2]"
                        >
                          <PencilIcon />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingId(conv.thread_id);
                          }}
                          title="Delete"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[#9A9CA6] hover:bg-white/[0.1] hover:text-[var(--danger)]"
                        >
                          <TrashIcon />
                        </span>
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center gap-2.5 border-t border-white/10 px-4 py-3">
          <UserButton afterSignOutUrl="/sign-in" />
          <span className="text-[13px] text-[#9A9CA6]">Account</span>
        </div>
      </aside>
    </>
  );
}