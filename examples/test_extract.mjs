import assert from "node:assert/strict";

import {
  extractNote,
  extractProfile,
  parseInitialStateText,
} from "../xiaohongshu-ces-collector/scripts/extract_xhs_state.mjs";

const initialState = {
  note: {
    noteDetailMap: {
      "note-001": {
        note: {
          noteId: "note-001",
          title: "Example guide",
          desc: "Example body",
          time: 1784098117000,
          user: {
            nickname: "Example author",
            userId: "author-001",
            xsecToken: "example-token",
          },
          interactInfo: {
            likedCount: "10",
            commentCount: "5",
            collectedCount: "2",
          },
        },
      },
    },
  },
  user: {
    userPageData: {
      basicInfo: {
        nickname: "Example author",
        desc: "Example profile",
      },
      interactions: [
        {
          type: "fans",
          count: "900",
          i18nCount: "900",
        },
      ],
    },
  },
};

const scriptText = `window.__INITIAL_STATE__=${JSON.stringify(initialState)}`;
const parsed = parseInitialStateText(scriptText);
const note = extractNote(parsed, "note-001");
const profile = extractProfile(parsed);

assert.equal(note.note_id, "note-001");
assert.equal(note.likes, 10);
assert.equal(note.comments, 5);
assert.equal(note.collects, 2);
assert.equal(profile.author, "Example author");
assert.equal(profile.fans, 900);

console.log(JSON.stringify({ note, profile }, null, 2));
