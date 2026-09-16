// const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// /**
//  * Every function below takes a Clerk session token as its first argument.
//  * Get one in a component with `const { getToken } = useAuth()` and call
//  * `await getToken()` right before each request — Clerk caches/refreshes it
//  * cheaply, so calling it per-request is fine and keeps the token fresh.
//  */
// function authHeaders(token, extra = {}) {
//   return {
//     ...extra,
//     ...(token ? { Authorization: `Bearer ${token}` } : {}),
//   };
// }

// export async function fetchUsage(token) {
//   const res = await fetch(`${API_BASE}/usage`, {
//     headers: { Authorization: `Bearer ${token}` },
//   });
//   if (!res.ok) throw new Error("Could not fetch usage.");
//   return res.json();
// }

// export async function fetchConversations(token) {
//   const res = await fetch(`${API_BASE}/conversations`, {
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to load conversations");
//   return res.json();
// }

// export async function fetchHistory(token, threadId) {
//   const res = await fetch(`${API_BASE}/history/${threadId}`, {
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to load chat history");
//   return res.json();
// }

// /**
//  * Renames a conversation: PATCH /conversations/:threadId  body: { title }
//  */
// export async function renameConversation(token, threadId, title) {
//   const res = await fetch(`${API_BASE}/conversations/${threadId}`, {
//     method: "PATCH",
//     headers: authHeaders(token, { "Content-Type": "application/json" }),
//     body: JSON.stringify({ title }),
//   });
//   if (!res.ok) throw new Error("Failed to rename conversation");
//   return res.json();
// }

// /**
//  * Permanently deletes a conversation: DELETE /conversations/:threadId
//  */
// export async function deleteConversation(token, threadId) {
//   const res = await fetch(`${API_BASE}/conversations/${threadId}`, {
//     method: "DELETE",
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to delete conversation");
//   return res.json().catch(() => ({}));
// }

// /**
//  * Fetches the signed-in user's email connection status (never the password).
//  * Returns { configured: false } if nothing has been saved yet.
//  */
// export async function getEmailSettings(token) {
//   const res = await fetch(`${API_BASE}/email-settings`, {
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to load email settings");
//   return res.json();
// }

// /**
//  * Saves (or updates) the signed-in user's SMTP credentials. Omit
//  * smtp_password to update host/port/from-name without changing an
//  * already-saved password.
//  */
// export async function saveEmailSettings(token, settings) {
//   const res = await fetch(`${API_BASE}/email-settings`, {
//     method: "POST",
//     headers: authHeaders(token, { "Content-Type": "application/json" }),
//     body: JSON.stringify(settings),
//   });
//   if (!res.ok) {
//     const body = await res.json().catch(() => ({}));
//     throw new Error(body.error || "Failed to save email settings");
//   }
//   return res.json();
// }

// /**
//  * Disconnects email for the signed-in user.
//  */
// export async function deleteEmailSettings(token) {
//   const res = await fetch(`${API_BASE}/email-settings`, {
//     method: "DELETE",
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to remove email settings");
//   return res.json();
// }

// /**
//  * Lists the signed-in user's recurring email automations.
//  */
// export async function listAutomations(token) {
//   const res = await fetch(`${API_BASE}/automations`, {
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to load automations");
//   return res.json();
// }

// /**
//  * Creates a new hourly/daily email automation.
//  * body: { to_email, subject, body, frequency: "hourly"|"daily", time_of_day?: "HH:MM" }
//  */
// export async function createAutomation(token, automation) {
//   const res = await fetch(`${API_BASE}/automations`, {
//     method: "POST",
//     headers: authHeaders(token, { "Content-Type": "application/json" }),
//     body: JSON.stringify(automation),
//   });
//   if (!res.ok) {
//     const body = await res.json().catch(() => ({}));
//     throw new Error(body.error || "Failed to create automation");
//   }
//   return res.json();
// }

// /**
//  * Enables or disables an existing automation.
//  */
// export async function setAutomationEnabled(token, automationId, enabled) {
//   const res = await fetch(`${API_BASE}/automations/${automationId}`, {
//     method: "PATCH",
//     headers: authHeaders(token, { "Content-Type": "application/json" }),
//     body: JSON.stringify({ enabled }),
//   });
//   if (!res.ok) throw new Error("Failed to update automation");
//   return res.json();
// }

// /**
//  * Permanently deletes an automation.
//  */
// export async function deleteAutomation(token, automationId) {
//   const res = await fetch(`${API_BASE}/automations/${automationId}`, {
//     method: "DELETE",
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to delete automation");
//   return res.json();
// }

// /**
//  * Fetches the signed-in user's saved job-search preferences.
//  * Returns { configured: false } if nothing has been saved yet.
//  */
// export async function getJobPreferences(token) {
//   const res = await fetch(`${API_BASE}/job-preferences`, {
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to load job preferences");
//   return res.json();
// }

// /**
//  * Saves (or updates) the signed-in user's job-search preferences.
//  * body: { role, location?, country?, max_days_old?, results_per_page?,
//  *         min_salary?, job_type?, remote_only?, keywords_exclude? }
//  */
// export async function saveJobPreferences(token, preferences) {
//   const res = await fetch(`${API_BASE}/job-preferences`, {
//     method: "POST",
//     headers: authHeaders(token, { "Content-Type": "application/json" }),
//     body: JSON.stringify(preferences),
//   });
//   if (!res.ok) {
//     const body = await res.json().catch(() => ({}));
//     throw new Error(body.error || "Failed to save job preferences");
//   }
//   return res.json();
// }

// /**
//  * Fetches the signed-in user's parsed resume (skills, experience,
//  * education, projects, preferred_roles). Returns { configured: false } if
//  * nothing has been uploaded yet.
//  */
// export async function getResume(token) {
//   const res = await fetch(`${API_BASE}/resume`, {
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to load resume");
//   return res.json();
// }

// /**
//  * Uploads a resume file (PDF, DOCX, or TXT) for parsing. Replaces any
//  * previously uploaded resume. `file` is a browser File object, e.g. from
//  * an <input type="file"> change event.
//  */
// export async function uploadResume(token, file) {
//   const formData = new FormData();
//   formData.append("file", file);

//   const res = await fetch(`${API_BASE}/resume`, {
//     method: "POST",
//     // No Content-Type here — the browser sets the multipart boundary
//     // itself based on the FormData body, and overriding it breaks the
//     // upload.
//     headers: authHeaders(token),
//     body: formData,
//   });
//   if (!res.ok) {
//     const body = await res.json().catch(() => ({}));
//     throw new Error(body.error || "Failed to upload resume");
//   }
//   return res.json();
// }

// /**
//  * Removes the signed-in user's stored resume.
//  */
// export async function deleteResume(token) {
//   const res = await fetch(`${API_BASE}/resume`, {
//     method: "DELETE",
//     headers: authHeaders(token),
//   });
//   if (!res.ok) throw new Error("Failed to remove resume");
//   return res.json();
// }

// /**
//  * Streams a chat response from the backend.
//  *
//  * The backend sends Server-Sent-Events-style chunks ("data: {...}\n\n") but
//  * over a POST request, so the built-in EventSource (GET-only) can't be used.
//  * Instead we read the raw response stream and parse the "data:" frames
//  * ourselves.
//  */
// export async function streamChat({ token, message, threadId, model, onToken, onDone, onError, onJobs }) {
//   try {
//     const res = await fetch(`${API_BASE}/chat/stream`, {
//       method: "POST",
//       headers: authHeaders(token, { "Content-Type": "application/json" }),
//       body: JSON.stringify({ message, thread_id: threadId, model }),
//     });

//     if (!res.ok || !res.body) {
//       throw new Error(`Request failed with status ${res.status}`);
//     }

//     const reader = res.body.getReader();
//     const decoder = new TextDecoder();
//     let buffer = "";

//     while (true) {
//       const { value, done } = await reader.read();
//       if (done) break;

//       buffer += decoder.decode(value, { stream: true });

//       const frames = buffer.split("\n\n");
//       buffer = frames.pop() || "";

//       for (const frame of frames) {
//         const line = frame.trim();
//         if (!line.startsWith("data:")) continue;

//         const jsonStr = line.slice(5).trim();
//         if (!jsonStr) continue;

//         let payload;
//         try {
//           payload = JSON.parse(jsonStr);
//         } catch {
//           continue;
//         }

//         if (payload.token) onToken(payload.token);
//         if (payload.jobs) onJobs?.(payload.jobs, payload.count);
//         if (payload.error) onError?.(payload.error);
//         if (payload.done) onDone?.();
//       }
//     }
//   } catch (err) {
//     onError?.(err.message || "Something went wrong while streaming the response.");
//     onDone?.();
//   }
// }



const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Every function below takes a Clerk session token as its first argument.
 * Get one in a component with `const { getToken } = useAuth()` and call
 * `await getToken()` right before each request — Clerk caches/refreshes it
 * cheaply, so calling it per-request is fine and keeps the token fresh.
 */
function authHeaders(token, extra = {}) {
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchUsage(token) {
  const res = await fetch(`${API_BASE}/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not fetch usage.");
  return res.json();
}

export async function fetchConversations(token) {
  const res = await fetch(`${API_BASE}/conversations`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load conversations");
  return res.json();
}

export async function fetchHistory(token, threadId) {
  const res = await fetch(`${API_BASE}/history/${threadId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load chat history");
  return res.json();
}

/**
 * Renames a conversation: PATCH /conversations/:threadId  body: { title }
 */
export async function renameConversation(token, threadId, title) {
  const res = await fetch(`${API_BASE}/conversations/${threadId}`, {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to rename conversation");
  return res.json();
}

/**
 * Permanently deletes a conversation: DELETE /conversations/:threadId
 */
export async function deleteConversation(token, threadId) {
  const res = await fetch(`${API_BASE}/conversations/${threadId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to delete conversation");
  return res.json().catch(() => ({}));
}

/**
 * Fetches the signed-in user's email connection status (never the password).
 * Returns { configured: false } if nothing has been saved yet.
 */
export async function getEmailSettings(token) {
  const res = await fetch(`${API_BASE}/email-settings`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load email settings");
  return res.json();
}

/**
 * Saves (or updates) the signed-in user's SMTP credentials. Omit
 * smtp_password to update host/port/from-name without changing an
 * already-saved password.
 */
export async function saveEmailSettings(token, settings) {
  const res = await fetch(`${API_BASE}/email-settings`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to save email settings");
  }
  return res.json();
}

/**
 * Disconnects email for the signed-in user.
 */
export async function deleteEmailSettings(token) {
  const res = await fetch(`${API_BASE}/email-settings`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to remove email settings");
  return res.json();
}

/**
 * Lists the signed-in user's recurring email automations.
 */
export async function listAutomations(token) {
  const res = await fetch(`${API_BASE}/automations`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load automations");
  return res.json();
}

/**
 * Creates a new hourly/daily email automation.
 * body: { to_email, subject, body, frequency: "hourly"|"daily", time_of_day?: "HH:MM" }
 */
export async function createAutomation(token, automation) {
  const res = await fetch(`${API_BASE}/automations`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(automation),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create automation");
  }
  return res.json();
}

/**
 * Enables or disables an existing automation.
 */
export async function setAutomationEnabled(token, automationId, enabled) {
  const res = await fetch(`${API_BASE}/automations/${automationId}`, {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error("Failed to update automation");
  return res.json();
}

/**
 * Permanently deletes an automation.
 */
export async function deleteAutomation(token, automationId) {
  const res = await fetch(`${API_BASE}/automations/${automationId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to delete automation");
  return res.json();
}

/**
 * Fetches the signed-in user's saved job-search preferences.
 * Returns { configured: false } if nothing has been saved yet.
 */
export async function getJobPreferences(token) {
  const res = await fetch(`${API_BASE}/job-preferences`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load job preferences");
  return res.json();
}

/**
 * Saves (or updates) the signed-in user's job-search preferences.
 * body: { role, location?, country?, max_days_old?, results_per_page?,
 *         min_salary?, job_type?, remote_only?, keywords_exclude? }
 */
export async function saveJobPreferences(token, preferences) {
  const res = await fetch(`${API_BASE}/job-preferences`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(preferences),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to save job preferences");
  }
  return res.json();
}

/**
 * Fetches the signed-in user's parsed resume (skills, experience,
 * education, projects, preferred_roles). Returns { configured: false } if
 * nothing has been uploaded yet.
 */
export async function getResume(token) {
  const res = await fetch(`${API_BASE}/resume`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load resume");
  return res.json();
}

/**
 * Uploads a resume file (PDF, DOCX, or TXT) for parsing. Replaces any
 * previously uploaded resume. `file` is a browser File object, e.g. from
 * an <input type="file"> change event.
 */
export async function uploadResume(token, file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/resume`, {
    method: "POST",
    // No Content-Type here — the browser sets the multipart boundary
    // itself based on the FormData body, and overriding it breaks the
    // upload.
    headers: authHeaders(token),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to upload resume");
  }
  return res.json();
}

/**
 * Removes the signed-in user's stored resume.
 */
export async function deleteResume(token) {
  const res = await fetch(`${API_BASE}/resume`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to remove resume");
  return res.json();
}

/**
 * Hand-edits the signed-in user's resume: preferred roles, years of
 * experience, and skills (add or delete one). Always send the FULL current
 * lists, not a diff — an empty skills array clears every skill.
 * body: { skills: string[], preferred_roles: string[], experience_years: number|null }
 */
export async function updateResumeDetails(token, updates) {
  const res = await fetch(`${API_BASE}/resume`, {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to update resume");
  }
  return res.json();
}

/**
 * Derives a stable id for a job listing so it can be saved/looked-up later.
 * None of the job sources (Adzuna, RemoteOK, Remotive, RSS) hand back a
 * real id of their own, so this mirrors the backend's job_id computation
 * (see app.py) exactly: the listing's URL when it has one, otherwise a
 * lowercase "title::company::location" fallback. Keep this in sync with
 * the backend if either side ever changes.
 */
export function computeJobId(job) {
  const url = (job?.url || "").trim();
  if (url) return url;
  const title = (job?.title || "").trim().toLowerCase();
  const company = (job?.company || "").trim().toLowerCase();
  const location = (job?.location || "").trim().toLowerCase();
  return `${title}::${company}::${location}`;
}

/**
 * Fetches the signed-in user's bookmarked jobs, most recently saved first.
 */
export async function fetchSavedJobs(token) {
  const res = await fetch(`${API_BASE}/saved-jobs`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load saved jobs");
  return res.json();
}

/**
 * Bookmarks a job listing. Pass the full job object as returned by a chat
 * search (title, company, url, etc.) — job_id is computed and attached
 * automatically.
 */
export async function saveJob(token, job) {
  const res = await fetch(`${API_BASE}/saved-jobs`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ ...job, job_id: computeJobId(job) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to save job");
  }
  return res.json();
}

/**
 * Removes a job from the signed-in user's saved list.
 */
export async function deleteSavedJob(token, jobId) {
  const res = await fetch(`${API_BASE}/saved-jobs?job_id=${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to remove saved job");
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
export async function streamChat({ token, message, threadId, model, onToken, onDone, onError, onJobs }) {
  try {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
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
        if (payload.jobs) onJobs?.(payload.jobs, payload.count, payload.page_size);
        if (payload.error) onError?.(payload.error);
        if (payload.done) onDone?.();
      }
    }
  } catch (err) {
    onError?.(err.message || "Something went wrong while streaming the response.");
    onDone?.();
  }
}