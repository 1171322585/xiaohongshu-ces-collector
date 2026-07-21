// playwright-cli run-code function.
// Required same-origin localStorage keys:
// xhs_fan_batch = encodeURIComponent(JSON.stringify([{author_id, author, profile_url}]))
// xhs_fan_output = absolute JSON output path
// Optional: xhs_fan_limit = numeric ceiling; xhs_worker_count = positive integer (default 3)
// Reads structured state first, then a local DOM label. It never scans the whole page text.
async (page) => {
  const profiles = JSON.parse(decodeURIComponent(await page.evaluate(() => localStorage.getItem("xhs_fan_batch"))));
  const outputPath = await page.evaluate(() => localStorage.getItem("xhs_fan_output"));
  const fanLimitRaw = await page.evaluate(() => localStorage.getItem("xhs_fan_limit"));
  const fanLimit = fanLimitRaw === null || fanLimitRaw === "" ? null : Number(fanLimitRaw);
  const workerCount = Math.max(1, Math.min(6, Number(await page.evaluate(() => localStorage.getItem("xhs_worker_count"))) || 3));
  if (!outputPath) throw new Error("xhs_fan_output is required");
  if (fanLimit !== null && (!Number.isFinite(fanLimit) || fanLimit < 0)) throw new Error("xhs_fan_limit must be a non-negative number");

  const results = new Array(profiles.length);
  let cursor = 0;
  const parseFans = (value) => {
    const text = String(value || "").replace(/\s+/g, "").toLowerCase();
    const match = text.match(/([0-9]+(?:\.[0-9]+)?)(万|千|w|k)?(\+)?/i);
    if (!match) return { fans: null, approximate: false, lower_bound: false };
    const multiplier = { "万": 10000, "千": 1000, w: 10000, k: 1000 }[match[2]?.toLowerCase()] || 1;
    return {
      fans: Math.round(Number(match[1]) * multiplier),
      approximate: multiplier !== 1 || Boolean(match[3]),
      lower_bound: Boolean(match[3]),
    };
  };
  const decide = (parsed) => {
    if (parsed.fans === null) return { status: "unknown", passes_fans: null };
    if (fanLimit === null) return { status: "measured", passes_fans: null };
    if (parsed.lower_bound && parsed.fans < fanLimit) return { status: "unknown", passes_fans: null };
    if (parsed.fans > fanLimit || (parsed.fans === fanLimit && parsed.approximate)) {
      return { status: "reject", passes_fans: false };
    }
    return { status: "pass", passes_fans: true };
  };

  const worker = async () => {
    const tab = await page.context().newPage();
    while (true) {
      const index = cursor++;
      if (index >= profiles.length) break;
      const profile = profiles[index];
      try {
        await tab.goto(profile.profile_url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await tab.waitForFunction(() => {
          const interactions = window.__INITIAL_STATE__?.user?.userPageData?.interactions || [];
          if (interactions.some((item) => item?.type === "fans" && item?.count !== undefined)) return true;
          return [...document.querySelectorAll("span, div")].some((element) =>
            element.children.length === 0 && element.textContent?.trim() === "粉丝"
          );
        }, null, { timeout: 3500 }).catch(() => {});

        const extracted = await tab.evaluate(() => {
          const interactions = window.__INITIAL_STATE__?.user?.userPageData?.interactions || [];
          const fansEntry = interactions.find((item) => item?.type === "fans" && item?.count !== undefined);
          if (fansEntry) return { display: String(fansEntry.count), source: "initial_state" };

          const labels = [...document.querySelectorAll("span, div")].filter((element) =>
            element.children.length === 0 && element.textContent?.trim() === "粉丝"
          );
          for (const label of labels.slice(0, 20)) {
            let node = label.parentElement;
            for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
              const text = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
              const before = text.match(/([0-9]+(?:\.[0-9]+)?\s*(?:万|千|w|k)?\+?)\s*粉丝/i);
              const after = text.match(/粉丝\s*([0-9]+(?:\.[0-9]+)?\s*(?:万|千|w|k)?\+?)/i);
              const match = before || after;
              if (match) return { display: match[1].trim(), source: "local_dom" };
            }
          }
          return { display: null, source: null };
        });

        const parsed = parseFans(extracted.display);
        const decision = decide(parsed);
        results[index] = {
          ...profile,
          fans_display: extracted.display,
          fans: parsed.fans,
          extraction_source: extracted.source,
          fans_approximate: parsed.approximate,
          fans_lower_bound: parsed.lower_bound,
          fan_limit: fanLimit,
          status: decision.status,
          passes_fans: decision.passes_fans,
        };
      } catch (error) {
        results[index] = {
          ...profile,
          fans: null,
          extraction_source: null,
          fan_limit: fanLimit,
          status: "unknown",
          passes_fans: null,
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
    link.download = "xhs-fans.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, JSON.stringify(results, null, 2));
  await (await downloadPromise).saveAs(outputPath);
  return {
    checked: results.length,
    passed: results.filter((item) => item.status === "pass").length,
    rejected: results.filter((item) => item.status === "reject").length,
    unknown: results.filter((item) => item.status === "unknown").length,
  };
}
