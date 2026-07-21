const INITIAL_STATE_PREFIX = "window.__INITIAL_STATE__=";

function replaceUndefinedTokens(input) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (input.startsWith("undefined", index)) {
      const before = input[index - 1] ?? "";
      const after = input[index + 9] ?? "";
      if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) {
        output += "null";
        index += 8;
        continue;
      }
    }
    output += char;
  }
  return output;
}

export function parseCount(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Expected a numeric value, received: ${value}`);
    return value;
  }

  const text = String(value).trim().replace(/,/g, "");
  if (text === "" || text === "赞") return 0;
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*([万千亿]?)$/);
  if (!match) throw new TypeError(`Expected a numeric value, received: ${value}`);

  const multiplier = { "": 1, 千: 1_000, 万: 10_000, 亿: 100_000_000 }[match[2]];
  return Number(match[1]) * multiplier;
}

export function parseInitialStateText(scriptText) {
  if (typeof scriptText !== "string" || scriptText.trim() === "") {
    throw new TypeError("Initial state script text is required");
  }

  const trimmed = scriptText.trim();
  const raw = trimmed.startsWith(INITIAL_STATE_PREFIX)
    ? trimmed.slice(INITIAL_STATE_PREFIX.length)
    : trimmed;

  return JSON.parse(replaceUndefinedTokens(raw.replace(/;\s*$/, "")));
}

function noteEntry(state, expectedNoteId) {
  const map = state?.note?.noteDetailMap ?? {};
  const fallbackId = Object.keys(map)[0];
  const noteId = expectedNoteId ?? fallbackId;
  return { entry: map[noteId] ?? map[fallbackId], noteId };
}

function flattenComment(comment, output, level = 0) {
  if (!comment || level > 8) return;
  const content = String(comment.content ?? "").trim();
  if (content) output.push(content);

  const replies = comment.subComments ?? comment.sub_comments ?? [];
  for (const reply of replies) flattenComment(reply, output, level + 1);
}

export function extractComments(state, expectedNoteId) {
  const { entry } = noteEntry(state, expectedNoteId);
  const commentsState = entry?.comments ?? {};
  const list = commentsState.list ?? [];
  const visibleComments = [];

  for (const comment of list) flattenComment(comment, visibleComments);

  return {
    comments_text: visibleComments.join("\n"),
    visible_comments: visibleComments,
    loaded_top_comments: list.length,
    comments_has_more: Boolean(commentsState.hasMore ?? commentsState.has_more),
  };
}

function extractNoteEntry(entry, expectedNoteId, fallbackId) {
  const note = entry?.note;
  if (!note) throw new Error("No note was found in note.noteDetailMap");

  const noteId = String(note.noteId ?? expectedNoteId ?? fallbackId ?? "");
  const interactions = note.interactInfo ?? {};
  const publishedAt = new Date(parseCount(note.time));
  if (Number.isNaN(publishedAt.getTime())) throw new Error("The note publish timestamp is invalid");

  return {
    note_id: noteId,
    title: String(note.title ?? ""),
    body: String(note.desc ?? ""),
    author: String(note.user?.nickname ?? ""),
    author_id: String(note.user?.userId ?? ""),
    author_xsec_token: String(note.user?.xsecToken ?? note.user?.xsec_token ?? ""),
    published_at: publishedAt.toISOString(),
    likes: parseCount(interactions.likedCount),
    comments: parseCount(interactions.commentCount),
    collects: parseCount(interactions.collectedCount),
    url: noteId ? `https://www.xiaohongshu.com/explore/${encodeURIComponent(noteId)}` : "",
  };
}

export function extractNote(state, expectedNoteId) {
  const map = state?.note?.noteDetailMap ?? {};
  const fallbackId = Object.keys(map)[0];
  const entry = map[expectedNoteId] ?? map[fallbackId];
  return {
    ...extractNoteEntry(entry, expectedNoteId, fallbackId),
    ...extractComments(state, expectedNoteId),
  };
}

export function extractNotes(state) {
  const map = state?.note?.noteDetailMap ?? {};
  return Object.entries(map)
    .filter(([, entry]) => entry?.note)
    .map(([noteId, entry]) => ({
      ...extractNoteEntry(entry, noteId, noteId),
      ...extractComments(state, noteId),
    }));
}

export function extractProfile(state) {
  const profile = state?.user?.userPageData;
  if (!profile) throw new Error("No profile was found in user.userPageData");

  const fansEntry = (profile.interactions ?? []).find(
    (interaction) => interaction?.type === "fans",
  );
  if (!fansEntry) throw new Error("No follower count was found in profile interactions");

  return { fans: parseCount(fansEntry.count) };
}

export function findInitialStateScriptText(scriptTexts) {
  if (!Array.isArray(scriptTexts)) {
    throw new TypeError("scriptTexts must be an array of strings");
  }

  const match = scriptTexts.find(
    (text) => typeof text === "string" && text.trim().startsWith(INITIAL_STATE_PREFIX),
  );
  if (!match) throw new Error("window.__INITIAL_STATE__ script was not found");
  return match;
}
