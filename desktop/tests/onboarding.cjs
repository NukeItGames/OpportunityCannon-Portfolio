const { _electron: electron, chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  fs.mkdirSync(".test-data", { recursive: true });
  fs.mkdirSync("test-results", { recursive: true });
  const userData = fs.mkdtempSync(
    path.resolve(
      process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
      "onboarding-",
    ),
  );
  const env = { ...process.env, CANNON_TEST_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  const exe = process.argv[2];
  const launch = () =>
    electron.launch(
      exe ? { executablePath: path.resolve(exe), env } : { args: ["."], env },
    );
  let app = await launch();
  let page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Set up Opportunity Cannon" })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.cannon.call("profiles"))).profiles.shared
      .email,
    "",
  );
  await page.getByLabel("name", { exact: true }).fill("ONBOARDING FIXTURE");
  await page.getByLabel("email", { exact: true }).fill("fixture@example.test");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Set up Job Search (optional)", { exact: true }).click();
  await page.getByLabel("skills", { exact: true }).fill("fixture skill");
  await page.getByRole("button", { name: "Add custom answer" }).click();
  await page.getByLabel("label 1", { exact: true }).fill("Fixture question");
  await page.getByLabel("value 1", { exact: true }).fill("Fixture answer");
  await page
    .getByLabel("url 1", { exact: true })
    .fill("https://example.test/jobs/fixture");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Set up VC Funding (optional)", { exact: true }).click();
  await page.getByLabel("company", { exact: true }).fill("FIXTURE STARTUP");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Save and finish setup" }).click();
  await page.getByText("VC FUNDING", { exact: true }).click();
  await page
    .getByRole("button", { name: "Profiles & settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "2. Job Search profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove answer" }).click();
  await page
    .getByLabel("skills", { exact: true })
    .fill("updated fixture skill");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Save all profiles" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Profiles saved locally" })
    .waitFor();
  await page.screenshot({ path: "test-results/onboarding-review.png" });
  const state = await page.evaluate(() => window.cannon.call("state", "vc"));
  assert.equal(state.dataPath, userData);
  assert.equal(state.settings.email, "fixture@example.test");
  assert.equal(state.settings.skills, undefined);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByText("JOB SEARCH", { exact: true }).click();
  const job = await page.evaluate(() => window.cannon.call("state", "job"));
  assert.equal(job.settings.skills, "updated fixture skill");
  assert.equal(job.settings.company, undefined);
  assert.equal(job.settings.customAnswers.length, 0);
  assert(
    !fs
      .readFileSync(path.join(userData, "opportunities.sqlite"))
      .includes(Buffer.from("ONBOARDING FIXTURE")),
  );
  assert(
    await app.evaluate(({ safeStorage }) =>
      safeStorage.isEncryptionAvailable(),
    ),
  );
  await app.close();
  const browser = await chromium.launch({ headless: true });
  const p = await browser.newPage();
  await p.setContent(
    '<form onsubmit="window.submitted=true;return false"><label>Full name<input></label><label>Password<input type="password"></label><label>Unknown required<input required></label><label>Company<input value="Preserve"></label><button type="submit">Submit</button></form>',
  );
  await p.addScriptTag({ path: "extension/fill.js" });
  const result = await p.evaluate(() =>
    fillVerified({ name: "FIXTURE", company: "Replace" }),
  );
  assert.equal(result.filled, 1);
  assert.equal(await p.locator("input[type=password]").inputValue(), "");
  assert.equal(
    await p.locator("input[value=Preserve]").inputValue(),
    "Preserve",
  );
  assert.equal(await p.evaluate(() => window.submitted), undefined);
  assert(result.missing.includes("unknown required"));
  await browser.close();
  console.log(
    "PASS: first run, wizard, editing, answer removal, identity/domain isolation, restart, Windows DPAPI, encrypted SQLite, extension safety" +
      (exe ? " (packaged)" : ""),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
