// playwright-cli run-code function.
// Required same-origin localStorage keys:
// xhs_note_batch = encodeURIComponent(JSON.stringify([{note_id, url, query}]))
// xhs_note_output = absolute JSON output path
// Optional:
// xhs_score_config = encodeURIComponent(JSON.stringify({name:"engagement",weights:{likes:1,comments:2,collects:1}}))
// xhs_worker_count = positive integer (default 3)
async (page) => {
  const candidates = JSON.parse(decodeURIComponent(await page.evaluate(() => localStorage.getItem("xhs_note_batch"))));
  const outputPath = await page.evaluate(() => localStorage.getItem("xhs_note_output"));
  const scoreConfigRaw = await page.evaluate(() => localStorage.getItem("xhs_score_config"));
  const scoreConfig = scoreConfigRaw ? JSON.parse(decodeURIComponent(scoreConfigRaw)) : null;
  const workerCount = Math.max(1, Math.min(6, Number(await page.evaluate(() => localStorage.getItem("xhs_worker_count"))) || 3));
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
        await tab.waitForFunction((noteId) => {
          const comments = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.comments;
          return Boolean(comments?.firstRequestFinish || comments?.list?.length);
        }, candidate.note_id, { timeout: 6000 }).catch(() => {});
        const data = await tab.evaluate((noteId) => {
          const entry = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId];
          if (!entry?.note) return null;
          const note = entry.note;
          const top = entry.comments?.list || [];
          const visible_comments = [];
          for (const comment of top) {
            visible_comments.push({ user_id: comment.userInfo?.userId || "", author: comment.userInfo?.nickname || "", content: comment.content || "", is_author: (comment.showTags || []).includes("is_author") });
            for (const sub of comment.subComments || []) visible_comments.push({ user_id: sub.userInfo?.userId || "", author: sub.userInfo?.nickname || "", content: sub.content || "", is_author: (sub.showTags || []).includes("is_author") });
          }
          return {
            title: note.title || "", body: note.desc || "", author: note.user?.nickname || "",
            author_id: note.user?.userId || "", author_xsec_token: note.user?.xsecToken || "",
            published_at: new Date(note.time).toISOString(), likes: Number(note.interactInfo?.likedCount || 0),
            comments: Number(note.interactInfo?.commentCount || 0), collects: Number(note.interactInfo?.collectedCount || 0),
            visible_comments, loaded_top_comments: top.length, comments_has_more: Boolean(entry.comments?.hasMore),
          };
        }, candidate.note_id);
        if (!data) throw new Error("note state missing");
        const weights = scoreConfig?.weights || null;
        const score = weights ? ["likes", "comments", "collects"].reduce((sum, key) => sum + data[key] * Number(weights[key] || 0), 0) : null;
        results[index] = {
          ...candidate, ...data, url,
          ...(weights ? { score_name: scoreConfig.name || "score", score, score_weights: weights } : {}),
        };
      } catch (error) {
        results[index] = { ...candidate, error: String(error?.message || error) };
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
  return { checked: results.length, ok: results.filter((x) => !x.error).length, failed: results.filter((x) => x.error).length };
}
