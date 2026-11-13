const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
(async () => {
  fs.mkdirSync(".test-data", { recursive: true });
  const root = fs.mkdtempSync(
      path.resolve(
        process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
        "migration-",
      ),
    ),
    legacy = path.join(root, "legacy");
  fs.mkdirSync(legacy);
  const db = new DatabaseSync(path.join(legacy, "opportunities.sqlite"));
  db.exec(
    "CREATE TABLE opportunities(id TEXT PRIMARY KEY,body TEXT);CREATE TABLE settings(id TEXT PRIMARY KEY,body TEXT);CREATE TABLE history(id INTEGER PRIMARY KEY,opportunity TEXT,changed TEXT,status TEXT);CREATE TABLE packets(id INTEGER PRIMARY KEY,created TEXT,body TEXT)",
  );
  db.prepare("INSERT INTO opportunities VALUES (?,?)").run(
    "fixture",
    JSON.stringify({
      id: "fixture",
      kind: "job",
      name: "PRIVATE LEGACY FIXTURE",
      company: "fixture",
      url: "https://example.test/apply",
      score: 0,
      status: "Applied",
      checked: "2026-01-01",
      details: "PRIVATE RESEARCH FIXTURE",
      verification: "fixture",
    }),
  );
  db.prepare("INSERT INTO history VALUES (1,?,?,?)").run(
    "fixture",
    "2026-01-01",
    "Applied",
  );
  db.close();
  const exe = process.argv[2];
  const launch = (dir, executable = exe) => {
    const env = { ...process.env, CANNON_TEST_DATA: dir };
    delete env.ELECTRON_RUN_AS_NODE;
    return electron.launch(
      executable
        ? { executablePath: path.resolve(executable), env }
        : { args: ["."], env },
    );
  };
  let app = await launch(legacy);
  let page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Set up Opportunity Cannon" })
    .waitFor();
  let state = await page.evaluate(() => window.cannon.call("state", "job"));
  assert.equal(state.items[0].status, "Applied");
  assert.equal(
    (await page.evaluate(() => window.cannon.call("history", "fixture")))
      .length,
    1,
  );
  // Seed old-version DPAPI profile and snapshot through a real Electron Windows process.
  const encrypted = await app.evaluate(({ safeStorage }) => {
    const profile = {
      name: "LEGACY CONTACT FIXTURE",
      email: "legacy@example.test",
      skills: "legacy fixture skill",
      limit: 12,
      boards: [],
      customAnswers: [],
    };
    return {
      credentials: safeStorage
        .encryptString(JSON.stringify({ aiKey: "CREDENTIAL FIXTURE ONLY" }))
        .toString("base64"),
      profile: safeStorage
        .encryptString(JSON.stringify(profile))
        .toString("base64"),
      packet: safeStorage
        .encryptString(
          JSON.stringify({ fields: { name: "LEGACY PACKET FIXTURE" } }),
        )
        .toString("base64"),
    };
  });
  const legacyDb = new DatabaseSync(path.join(legacy, "opportunities.sqlite"));
  legacyDb
    .prepare("INSERT INTO settings VALUES (?,?)")
    .run("profile-job", JSON.stringify(encrypted.profile));
  legacyDb
    .prepare("INSERT INTO packets(created,body) VALUES (?,?)")
    .run(
      "2026-01-01",
      JSON.stringify({ record: "fixture", encrypted: encrypted.packet }),
    );
  legacyDb
    .prepare("INSERT INTO settings VALUES (?,?)")
    .run("integrations", JSON.stringify(encrypted.credentials));
  legacyDb.close();
  await app.close();
  app = await launch(legacy);
  page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Set up Opportunity Cannon" })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.cannon.call("integrationStatus"))).hasKey,
    true,
  );
  assert(
    !fs
      .readFileSync(path.join(legacy, "credentials.dpapi"))
      .includes(Buffer.from("CREDENTIAL FIXTURE ONLY")),
  );
  const preview = await page.evaluate(() =>
    window.cannon.call("legacyPreview"),
  );
  assert.equal(preview.contacts.job.email, "legacy@example.test");
  await page.evaluate(
    (p) => window.cannon.call("profilesSave", p),
    preview.profiles,
  );
  const backup = path.join(root, "fixture.cannonbackup");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, backup);
  assert(
    await page.evaluate(() =>
      window.cannon.call("backupExport", "fixture password 123"),
    ),
  );
  assert(!fs.readFileSync(backup, "utf8").includes("LEGACY CONTACT FIXTURE"));
  await app.close();
  assert(
    !fs
      .readFileSync(path.join(legacy, "opportunities.sqlite"))
      .includes(Buffer.from("PRIVATE RESEARCH FIXTURE")),
  );
  const restored = path.join(root, "restored");
  app = await launch(restored);
  page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Set up Opportunity Cannon" })
    .waitFor();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, backup);
  await assert.rejects(() =>
    page.evaluate(() => window.cannon.call("backupPreview", "wrong password")),
  );
  assert.equal(
    (await page.evaluate(() => window.cannon.call("state", "job"))).items
      .length,
    0,
  );
  const plan = await page.evaluate(() =>
    window.cannon.call("backupPreview", "fixture password 123"),
  );
  assert.equal(plan.newOpportunities, 1);
  assert.equal(
    (await page.evaluate(() => window.cannon.call("state", "job"))).items
      .length,
    0,
  );
  await page.evaluate(() => window.cannon.call("backupMerge"));
  assert.equal(
    (await page.evaluate(() => window.cannon.call("integrationStatus"))).hasKey,
    false,
  );
  state = await page.evaluate(() => window.cannon.call("state", "job"));
  assert.equal(state.settings.email, "legacy@example.test");
  assert.equal(state.items[0].status, "Applied");
  assert.equal(
    (await page.evaluate(() => window.cannon.call("history", "fixture")))
      .length,
    1,
  );
  await app.close();
  app = await launch(restored);
  page = await app.firstWindow();
  assert.equal(
    (await page.evaluate(() => window.cannon.call("state", "job"))).settings
      .skills,
    "legacy fixture skill",
  );
  await app.close();
  // Optional previous-build -> current packaged-build upgrade using the same independent app-data directory.
  if (process.argv[3]) {
    app = await launch(restored, process.argv[3]);
    page = await app.firstWindow();
    assert.equal(
      (await page.evaluate(() => window.cannon.call("state", "job"))).items[0]
        .status,
      "Applied",
    );
    await app.close();
  }
  console.log(
    "PASS: legacy SQLite + DPAPI profile/snapshot migration, preview, encrypted export, wrong-password rejection, restore into fresh app data, history/profile preservation and restart" +
      (exe ? " (packaged)" : ""),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
