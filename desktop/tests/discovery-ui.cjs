const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
(async () => {
  const data = fs.mkdtempSync(
    path.resolve(
      process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
      "discovery-",
    ),
  );
  const db = new DatabaseSync(path.join(data, "opportunities.sqlite"));
  db.exec("CREATE TABLE opportunities(id TEXT PRIMARY KEY,body TEXT NOT NULL)");
  for (const [id, classification, score, reviewPriority] of [
    ["pending", "Requires Verification", 0, 42],
    ["verified", "Strong Match", 50, 0],
  ]) {
    db.prepare("INSERT INTO opportunities VALUES (?,?)").run(
      id,
      JSON.stringify({
        id,
        kind: "vc",
        name: `Fixture ${id}`,
        company: "Fictional test",
        url: `https://fixture.example/${id}`,
        classification,
        score,
        reviewPriority,
        status: "New",
        checked: new Date().toISOString(),
        details: "Fixture evidence only",
        reasons: [],
      }),
    );
  }
  db.close();
  const env = { ...process.env, CANNON_TEST_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(
    process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]), env }
      : { args: ["."], env },
  );
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const p = await window.cannon.call("profiles");
      await window.cannon.call("profilesSave", p.profiles);
    });
    await page.reload();
    await page.getByText("VC FUNDING", { exact: true }).click();
    await page.getByLabel("Quality").waitFor();
    assert.equal(await page.getByLabel("Quality").inputValue(), "matches");
    assert.equal(
      await page
        .getByText("Review priority 42/100 (not verified eligibility)", {
          exact: false,
        })
        .count(),
      1,
    );
    assert.deepEqual(await page.locator("article h2").allTextContents(), [
      "Fixture verified",
      "Fixture pending",
    ]);
    await page.getByLabel("Quality").selectOption("Strong Match");
    assert.equal(
      await page.getByText("Fixture pending", { exact: true }).count(),
      0,
    );
    await page.getByLabel("Quality").selectOption("Filtered Out");
    await page.screenshot({ path: "test-results/discovery-ui.png" });
    console.log(
      "PASS quality filters, verified-first ordering and explicitly unverified review priority",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
