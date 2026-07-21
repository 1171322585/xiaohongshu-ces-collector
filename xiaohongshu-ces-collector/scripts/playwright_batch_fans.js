// playwright-cli run-code function.
// Required same-origin localStorage keys:
// xhs_fan_batch = encodeURIComponent(JSON.stringify([{author_id, author, profile_url}]))
// xhs_fan_output = absolute JSON output path
// Optional: xhs_fan_limit = numeric ceiling; xhs_worker_count = positive integer (default 3)
// Without xhs_fan_limit the script only extracts fans and does not make a pass/fail decision.
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
    const match = text.match(/([0-9]+(?:\.[0-9]+)?)(万|千|w|k)?/i);
    if (!match) return { fans: null, approximate: false, lower_bound: false };
    const multiplier = { "万": 10000, "千": 1000, w: 10000, k: 1000 }[match[2]?.toLowerCase()] || 1;
    const fans = Math.round(Number(match[1]) * multiplier);
    return { fans, approximate: multiplier !== 1 || text.includes("+"), lower_bound: text.includes("+") };
  };
  const worker = async () => {
    const tab = await page.context().newPage();
    while (true) {
      const index = cursor++;
      if (index >= profiles.length) break;
      const profile = profiles[index];
      try {
        await tab.goto(profile.profile_url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await tab.waitForTimeout(700);
        const body = await tab.locator("body").innerText();
        const match = body.match(/([0-9.]+\s*[万千wWkK]?\+?)[\r\n ]+粉丝/);
        const parsed = parseFans(match?.[1]);
        const passesFans = fanLimit === null || parsed.fans === null
          ? null
          : parsed.fans < fanLimit || (parsed.fans === fanLimit && !parsed.approximate && !parsed.lower_bound);
        results[index] = {
          ...profile, fans_display: match?.[1]?.trim() || null, fans: parsed.fans,
          fans_approximate: parsed.approximate, fans_lower_bound: parsed.lower_bound,
          fan_limit: fanLimit, passes_fans: passesFans, title: await tab.title(),
        };
      } catch (error) {
        results[index] = { ...profile, fans: null, error: String(error?.message || error) };
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
    passed: fanLimit === null ? null : results.filter((x) => x.passes_fans === true).length,
    rejected: fanLimit === null ? null : results.filter((x) => x.passes_fans === false).length,
    extraction_failed: results.filter((x) => x.fans === null).length,
  };
}
