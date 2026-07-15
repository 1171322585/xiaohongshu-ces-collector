const INITIAL_STATE_PREFIX = "window.__INITIAL_STATE__=";

function numberValue(value) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Expected a numeric value, received: ${value}`);
  }
  return parsed;
}

export function parseInitialStateText(scriptText) {
  if (typeof scriptText !== "string" || scriptText.trim() === "") {
    throw new TypeError("Initial state script text is required");
  }

  const trimmed = scriptText.trim();
  const raw = trimmed.startsWith(INITIAL_STATE_PREFIX)
    ? trimmed.slice(INITIAL_STATE_PREFIX.length)
    : trimmed;

  return JSON.parse(raw.replace(/;\s*$/, "").replace(/\bundefined\b/g, "null"));
}

function extractNoteEntry(note, expectedNoteId, fallbackId) {
  if (!note) {
    throw new Error("No note was found in note.noteDetailMap");
  }

  const noteId = String(note.noteId ?? expectedNoteId ?? fallbackId ?? "");
  const interactions = note.interactInfo ?? {};
  const publishedAt = new Date(numberValue(note.time));
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error("The note publish timestamp is invalid");
  }

  return {
    note_id: noteId,
    title: String(note.title ?? ""),
    body: String(note.desc ?? ""),
    author: String(note.user?.nickname ?? ""),
    author_id: String(note.user?.userId ?? ""),
    published_at: publishedAt.toISOString(),
    likes: numberValue(interactions.likedCount),
    comments: numberValue(interactions.commentCount),
    collects: numberValue(interactions.collectedCount),
    url: noteId ? `https://www.xiaohongshu.com/explore/${encodeURIComponent(noteId)}` : "",
  };
}

export function extractNote(state, expectedNoteId) {
  const map = state?.note?.noteDetailMap ?? {};
  const fallbackId = Object.keys(map)[0];
  const entry = map[expectedNoteId] ?? map[fallbackId];
  return extractNoteEntry(entry?.note, expectedNoteId, fallbackId);
}

export function extractNotes(state) {
  const map = state?.note?.noteDetailMap ?? {};
  return Object.entries(map)
    .filter(([, entry]) => entry?.note)
    .map(([noteId, entry]) => extractNoteEntry(entry.note, noteId, noteId));
}

export function extractProfile(state) {
  const profile = state?.user?.userPageData;
  if (!profile) {
    throw new Error("No profile was found in user.userPageData");
  }

  const fansEntry = (profile.interactions ?? []).find(
    (interaction) => interaction?.type === "fans",
  );

  if (!fansEntry) {
    throw new Error("No follower count was found in profile interactions");
  }

  return {
    fans: numberValue(fansEntry.count),
  };
}

export function findInitialStateScriptText(scriptTexts) {
  if (!Array.isArray(scriptTexts)) {
    throw new TypeError("scriptTexts must be an array of strings");
  }
  const match = scriptTexts.find(
    (text) => typeof text === "string" && text.trim().startsWith(INITIAL_STATE_PREFIX),
  );
  if (!match) {
    throw new Error("window.__INITIAL_STATE__ script was not found");
  }
  return match;
}
