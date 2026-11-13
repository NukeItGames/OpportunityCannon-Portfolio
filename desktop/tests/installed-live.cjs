// Explicitly fictional live-search configuration, not a sample user profile.
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
const root = process.cwd(),
  out = path.resolve(process.env.CANNON_RESULTS || "test-results/repair");
fs.mkdirSync(out, { recursive: true });
const { _electron: electron } = require(
  path.join(root, "node_modules/@playwright/test"),
);
(async () => {
  const data = fs.mkdtempSync(path.join(out, "installed-live-data-"));
  const env = { ...process.env, CANNON_TEST_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({ executablePath: path.resolve(process.argv[2]), env });
  let app = await launch();
  let page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(async () => {
    const p = (await window.cannon.call("profiles")).profiles;
    p.shared.name = "ISOLATED AUDIT";
    p.job = {
      ...p.job,
      enabled: true,
      locations: [{ city: "Toronto", country: "Canada" }],
      jobTitleKeywords: "accountant",
      skills: "accounting",
      automaticDiscovery: true,
      discoveryQueryLimit: 2,
      limit: 6,
      boards: [],
    };
    p.vc = {
      ...p.vc,
      enabled: true,
      productKeywords: "cleantech",
      stageKeywords: "seed",
      targetRegion: "Ontario",
      targetCountries: "Canada",
      automaticDiscovery: true,
      discoveryQueryLimit: 2,
      limit: 6,
      fundingSources: [],
    };
    await window.cannon.call("profilesSave", p);
  });
  await page.reload();
  const all = {
    time: new Date().toISOString(),
    executable: path.resolve(process.argv[2]),
    runs: [],
    errors,
  };
  for (const mode of ["job", "vc"]) {
    console.log("SEARCH " + mode);
    await page.evaluate((m) => window.cannon.call("search", m), mode);
    const state = await page.evaluate(
      (m) => window.cannon.call("state", m),
      mode,
    );
    all.runs.push({ mode, ...state });
    fs.writeFileSync(
      path.join(out, "installed-live-results.json"),
      JSON.stringify(all, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          mode,
          count: state.items.length,
          quality: state.items.reduce(
            (a, o) => (
              (a[o.classification] = (a[o.classification] || 0) + 1),
              a
            ),
            {},
          ),
          log: state.log,
        },
        null,
        2,
      ),
    );
    assert(state.items.every((o) => o.kind === mode));
    assert(
      state.items.every(
        (o) => !["Strong Match", "Golden Ticket"].includes(o.classification),
      ),
    );
  }
  await page.getByText("JOB SEARCH", { exact: true }).click();
  await page.screenshot({ path: path.join(out, "installed-jobs.png") });
  const item = all.runs[0].items[0];
  if (item) {
    await page.evaluate(
      (id) => window.cannon.call("status", id, "Saved"),
      item.id,
    );
    await page.evaluate(
      (id) => window.cannon.call("notes", id, "ISOLATED AUDIT NOTE", ""),
      item.id,
    );
  }
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  const after = await page.evaluate(() => window.cannon.call("state", "job"));
  assert.equal(after.items.length, all.runs[0].items.length);
  if (item) {
    assert.equal(after.items.find((o) => o.id === item.id).status, "Saved");
    assert.equal(
      after.items.find((o) => o.id === item.id).notes,
      "ISOLATED AUDIT NOTE",
    );
  }
  all.restartPassed = true;
  fs.writeFileSync(
    path.join(out, "installed-live-results.json"),
    JSON.stringify(all, null, 2),
  );
  await app.close();
  console.log("PASS installed live discovery and restart persistence");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
