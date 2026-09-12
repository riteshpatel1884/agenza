const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function fetchModels() {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error("Failed to load models");
  return res.json();
}

export async function fetchConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error("Failed to load conversations");
  return res.json();
}

export async function fetchHistory(threadId) {
  const res = await fetch(`${API_BASE}/history/${threadId}`);
  if (!res.ok) throw new Error("Failed to load chat history");
  return res.json();
}

/**
 * Renames a conversation. Expects the backend to expose:
 *   PATCH /conversations/:threadId   body: { title }
 * Returns the updated conversation record.
 */
export async function renameConversation(threadId, title) {
  const res = await fetch(`${API_BASE}/conversations/${threadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to rename conversation");
  return res.json();
}

/**
 * Permanently deletes a conversation. Expects the backend to expose:
 *   DELETE /conversations/:threadId
 */
export async function deleteConversation(threadId) {
  const res = await fetch(`${API_BASE}/conversations/${threadId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete conversation");
  return res.json().catch(() => ({}));
}

/**
 * Streams a chat response from the backend.
 *
 * The backend sends Server-Sent-Events-style chunks ("data: {...}\n\n") but
 * over a POST request, so the built-in EventSource (GET-only) can't be used.
 * Instead we read the raw response stream and parse the "data:" frames
 * ourselves.
 */
export async function streamChat({ message, threadId, model, onToken, onDone, onError }) {
  try {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, thread_id: threadId, model }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;

        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;

        let payload;
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (payload.token) onToken(payload.token);
        if (payload.error) onError?.(payload.error);
        if (payload.done) onDone?.();
      }
    }
  } catch (err) {
    onError?.(err.message || "Something went wrong while streaming the response.");
    onDone?.();
  }
}