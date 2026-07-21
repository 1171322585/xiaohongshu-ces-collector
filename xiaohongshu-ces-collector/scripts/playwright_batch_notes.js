// playwright-cli run-code function.
// Required same-origin localStorage keys:
// xhs_note_batch = encodeURIComponent(JSON.stringify([{note_id, query, url, author_url?}]))
// xhs_note_output = absolute JSON output path
// Optional: xhs_score_config = encoded JSON {name, weights:{likes,comments,collects}}
// Optional: xhs_worker_count = 1..6 (default 3)
// Optional: xhs_include_initial_comments = "true" (default false)
// Optional: xhs_include_card_raw = "true" (default false)
async (page) => {
  const candidates = JSON.parse(decodeURIComponent(await page.evaluate(() => localStorage.getItem("xhs_note_batch"))));
  const outputPath = await page.evaluate(() => localStorage.getItem("xhs_note_output"));
  const scoreRaw = await page.evaluate(() => localStorage.getItem("xhs_score_config"));
  const scoreConfig = scoreRaw ? JSON.parse(decodeURIComponent(scoreRaw)) : null;
  const workerCount = Math.max(1, Math.min(6, Number(await page.evaluate(() => localStorage.getItem("xhs_worker_count"))) || 3));
  const includeInitialComments = await page.evaluate(() => localStorage.getItem("xhs_include_initial_comments") === "true");
  const includeCardRaw = await page.evaluate(() => localStorage.getItem("xhs_include_card_raw") === "true");
  if (!outputPath) throw new Error("xhs_note_output is required");

  const results = new Array(candidates.length);
  let cursor = 0;
  const worker = async () => {
    const tab = await page.context().newPage();
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) break;
      const candidate = candidates[index];
      try {
        const url = candidate.url.replace("/search_result/", "/explore/").replace(/xsec_source=[^&]*/, "xsec_source=pc_search");
        await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        if (includeInitialComments) {
          await tab.waitForFunction((noteId) => {
            const comments = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.comments;
            return Boolean(comments?.firstRequestFinish || comments?.list?.length);
          }, candidate.note_id, { timeout: 6000 }).catch(() => {});
        }

        const data = await tab.evaluate(({ noteId, includeComments }) => {
          const entry = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId];
          if (!entry?.note) return null;
          const note = entry.note;
          const timestamp = Number(note.time);
          const top = includeComments ? entry.comments?.list || [] : [];
          const visibleComments = [];
          if (includeComments) {
            for (const comment of top) {
              visibleComments.push({
                user_id: comment.userInfo?.userId || "",
                author: comment.userInfo?.nickname || "",
                content: comment.content || "",
                is_author: (comment.showTags || []).includes("is_author"),
              });
              for (const sub of comment.subComments || []) {
                visibleComments.push({
                  user_id: sub.userInfo?.userId || "",
                  author: sub.userInfo?.nickname || "",
                  content: sub.content || "",
                  is_author: (sub.showTags || []).includes("is_author"),
                });
              }
            }
          }
          return {
            title: note.title || "",
            body: note.desc || "",
            author: note.user?.nickname || "",
            author_id: note.user?.userId || "",
            author_xsec_token: note.user?.xsecToken || "",
            published_at: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
            likes: Number(note.interactInfo?.likedCount || 0),
            comments: Number(note.interactInfo?.commentCount || 0),
            collects: Number(note.interactInfo?.collectedCount || 0),
            ...(includeComments ? {
              visible_comments: visibleComments,
              loaded_top_comments: top.length,
              comments_has_more: Boolean(entry.comments?.hasMore),
              comments_coverage: entry.comments?.hasMore ? "initial_partial" : "initial_visible",
            } : { comments_coverage: "not_requested" }),
          };
        }, { noteId: candidate.note_id, includeComments: includeInitialComments });
        if (!data) throw new Error("note state missing");

        const weights = scoreConfig?.weights || null;
        const score = weights
          ? ["likes", "comments", "collects"].reduce((sum, key) => sum + data[key] * Number(weights[key] || 0), 0)
          : null;
        const compactCandidate = {
          note_id: candidate.note_id,
          query: candidate.query || "",
          url,
          ...(candidate.author_url ? { author_url: candidate.author_url } : {}),
        };
        results[index] = {
          ...(includeCardRaw ? candidate : compactCandidate),
          ...data,
          ...(score === null ? {} : { [scoreConfig.name || "score"]: score }),
        };
      } catch (error) {
        results[index] = {
          note_id: candidate.note_id,
          query: candidate.query || "",
          url: candidate.url,
          error: String(error?.message || error),
        };
      }
    }
    await tab.close();
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate((payload) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json;charset=utf-8" }));
    link.download = "xhs-notes.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, JSON.stringify(results, null, 2));
  await (await downloadPromise).saveAs(outputPath);
  return {
    checked: results.length,
    succeeded: results.filter((item) => !item.error).length,
    failed: results.filter((item) => item.error).length,
    initial_comments_requested: includeInitialComments,
  };
}
