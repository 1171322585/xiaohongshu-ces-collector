// playwright-cli run-code function.
// Required same-origin localStorage keys:
// xhs_queries = encodeURIComponent(JSON.stringify(["keyword", ...]))
// xhs_cards_output = absolute JSON output path
// Optional: xhs_scroll_rounds (default 4), xhs_max_cards_per_query (default unlimited)
// Clear xhs_cards_checkpoint and xhs_done_queries before starting a new task.
async (page) => {
  const queries = JSON.parse(decodeURIComponent(await page.evaluate(() => localStorage.getItem("xhs_queries"))));
  const outputPath = await page.evaluate(() => localStorage.getItem("xhs_cards_output"));
  const scrollRounds = Math.max(0, Number(await page.evaluate(() => localStorage.getItem("xhs_scroll_rounds"))) || 4);
  const maxCardsRaw = Number(await page.evaluate(() => localStorage.getItem("xhs_max_cards_per_query")));
  const maxCardsPerQuery = Number.isFinite(maxCardsRaw) && maxCardsRaw > 0 ? Math.floor(maxCardsRaw) : null;
  if (!outputPath) throw new Error("xhs_cards_output is required");
  const saved = JSON.parse(decodeURIComponent(await page.evaluate(() => localStorage.getItem("xhs_cards_checkpoint")) || "%5B%5D"));
  const done = new Set(JSON.parse(decodeURIComponent(await page.evaluate(() => localStorage.getItem("xhs_done_queries")) || "%5B%5D")));
  const collected = [...saved];
  for (const query of queries) {
    if (done.has(query)) continue;
    const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes&type=51`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(900);
    if (/captcha|website-login/.test(page.url())) break;
    for (let i = 0; i < scrollRounds; i += 1) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(450);
    }
    const cards = await page.locator("section.note-item").evaluateAll((els, args) => (args.limit ? els.slice(0, args.limit) : els).map((el) => {
      const noteLink = el.querySelector('a[href*="/search_result/"]');
      const authorLink = el.querySelector('a.author[href*="/user/profile/"]');
      const lines = (el.innerText || "").split("\n").map((x) => x.trim()).filter(Boolean);
      const href = noteLink?.href || "";
      return { query: args.query, note_id: href.match(/\/search_result\/([0-9a-f]+)/i)?.[1] || "", raw: el.innerText || "", lines, url: href, author_url: authorLink?.href || "" };
    }), { query, limit: maxCardsPerQuery });
    collected.push(...cards);
    done.add(query);
    await page.evaluate(({ rows, queriesDone }) => {
      localStorage.setItem("xhs_cards_checkpoint", encodeURIComponent(JSON.stringify(rows)));
      localStorage.setItem("xhs_done_queries", encodeURIComponent(JSON.stringify(queriesDone)));
    }, { rows: collected, queriesDone: [...done] });
  }
  const rows = [...new Map(collected.filter((x) => x.note_id).map((x) => [x.note_id, x])).values()];
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate((payload) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json;charset=utf-8" }));
    link.download = "xhs-cards.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, JSON.stringify(rows, null, 2));
  await (await downloadPromise).saveAs(outputPath);
  return { queries: queries.length, completed_queries: done.size, raw: collected.length, unique: rows.length };
}
