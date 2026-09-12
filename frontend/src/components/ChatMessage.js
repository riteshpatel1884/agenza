export default function ChatMessage({ role, content, onBusyBackground }) {
  const isUser = role === "user";
  const isEmptyAssistant = !isUser && content.length === 0;

  if (isUser) {
    return (
      <div className="w-full px-4 py-2.5">
        <div className="mx-auto flex max-w-2xl justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[var(--accent-soft)] px-4 py-2.5 text-[15px] leading-7 text-[var(--text-primary)]">
            {content}
          </div>
        </div>
      </div>
    );
  }

  const panelStyle = onBusyBackground
    ? { backgroundColor: "color-mix(in srgb, var(--bg-elevated) 85%, transparent)", backdropFilter: "blur(4px)" }
    : undefined;

  return (
    <div className="w-full px-4 py-2.5">
      <div className="mx-auto max-w-2xl">
        {isEmptyAssistant ? (
          <div
            className={`flex items-center gap-1.5 py-1.5 ${onBusyBackground ? "w-fit rounded-xl px-3.5" : ""}`}
            style={panelStyle}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-faint)]"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        ) : (
          <div
            className={`whitespace-pre-wrap text-[15px] leading-7 text-[var(--text-primary)] ${onBusyBackground ? "rounded-xl px-3.5 py-2" : ""}`}
            style={panelStyle}
          >
            {content}
          </div>
        )}
      </div>
    </div>
  );
}