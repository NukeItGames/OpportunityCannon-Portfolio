const { _electron: electron, chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
(async () => {
  if (process.env.CANNON_LIVE_PROFILE) {
    console.log(
      "User profile paths are not accepted by network tests.",
    );
    return;
  }
  // Explicitly fictional configuration; never read an existing user's profile.
  const configured = {version:1,shared:{name:'Fictional Avery'},job:{enabled:true,jobTitleKeywords:'librarian',skills:'cataloguing',locations:[{city:'Oslo',country:'Norway'}],boards:[],customAnswers:[]},vc:{enabled:true,productKeywords:'agriculture',targetCountries:'Japan',boards:[],fundingSources:[],customAnswers:[]}};
  fs.mkdirSync('.test-data',{recursive:true});
  const userData = fs.mkdtempSync(path.resolve('.test-data/two-mode-'));
  const env = { ...process.env, CANNON_TEST_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ["."], env });
  let page = await app.firstWindow();
  await page.evaluate(async (p) => {
    await window.cannon.call("profilesSave", p);
  }, configured);
  await page.reload();
  await page.getByText("VC FUNDING", { exact: true }).click();
  await page.getByText("Funding for your startup.", { exact: true }).waitFor();
  await page.screenshot({ path: "test-results/desktop-home.png" });
  await page.evaluate(() => window.cannon.call("search", "vc"));
  const state = await page.evaluate(() => window.cannon.call("state", "vc"));
  assert(state.items.length > 0);
  assert(state.items.every((x) => x.kind === "vc"));
  await page.getByText("Switch mode", { exact: true }).click();
  await page.getByText("JOB SEARCH", { exact: true }).click();
  const jobProfile = await page.evaluate(() =>
    window.cannon.call("state", "job"),
  );
  assert.equal(jobProfile.settings.email, configured.shared.email);
  assert.equal(jobProfile.settings.company, undefined);
  await page.evaluate(() => window.cannon.call("search", "job"));
  const jobState = await page.evaluate(() =>
    window.cannon.call("state", "job"),
  );
  assert(jobState.items.length > 0);
  assert(jobState.items.every((x) => x.kind === "job"));
  const id = state.items[0].id;
  await page.evaluate((id) => window.cannon.call("status", id, "Saved"), id);
  await page.screenshot({ path: "test-results/desktop-results.png" });
  await app.close();
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  await page.getByText("VC FUNDING", { exact: true }).click();
  await page.getByText("Funding for your startup.", { exact: true }).waitFor();
  const after = await page.evaluate(() => window.cannon.call("state", "vc"));
  assert.equal(after.items.find((x) => x.id === id).status, "Saved");
  assert.equal(after.items.length, state.items.length);
  // Open one genuine official application through Electron's real Windows HTTPS handler.
  const target = jobState.items[0];
  await page.evaluate((id) => window.cannon.call("open", id, false), target.id);
  fs.writeFileSync(
    "test-results/desktop-acceptance.json",
    JSON.stringify(
      {
        time: new Date().toISOString(),
        count: after.items.length,
        vc: after.items.filter((x) => x.kind === "vc").length,
        jobs: jobState.items.length,
        persisted: true,
        opened: target.url,
        log: after.log,
      },
      null,
      2,
    ),
  );
  await app.close();
  const browser = await chromium.launch({ headless: true });
  const p = await browser.newPage();
  await p.setContent(
    '<form onsubmit="window.submitted=true;return false"><label>Full name<input></label><label>Email<input type="email"></label><label>Password<input type="password"></label><label>Unknown required<input required></label><label>Company<input value="Keep this"></label><button type="submit">Submit</button></form>',
  );
  await p.addScriptTag({ path: "extension/fill.js" });
  const result = await p.evaluate(() =>
    fillVerified({
      name: "TEST ONLY",
      email: "test@example.com",
      company: "REPLACE",
    }),
  );
  assert.equal(result.filled, 2);
  assert.equal(await p.locator("input[type=password]").inputValue(), "");
  assert.equal(
    await p.locator('input[value="Keep this"]').inputValue(),
    "Keep this",
  );
  assert.equal(await p.evaluate(() => window.submitted), undefined);
  assert(result.missing.includes("unknown required"));
  await browser.close();
  console.log(
    "Desktop launch, live search, restart persistence, browser open and local autofill safety passed.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
