// Fictional test configuration; never used as application defaults.
const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
(async () => {
  const userData = fs.mkdtempSync(
    path.resolve(
      process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
      "eligibility-",
    ),
  );
  const db = new DatabaseSync(path.join(userData, "opportunities.sqlite"));
  db.exec("CREATE TABLE opportunities(id TEXT PRIMARY KEY,body TEXT NOT NULL)");
  const url = "https://employer.example/job";
  const text =
    "TypeScript software developer required in Toronto. Must independently debug software.";
  db.prepare("INSERT INTO opportunities VALUES (?,?)").run(
    "fixture",
    JSON.stringify({
      id: "fixture",
      name: "Fixture Developer",
      kind: "job",
      company: "Fixture",
      url,
      status: "New",
      score: 0,
      checked: new Date().toISOString(),
      details: text,
      eligibilitySource: text,
      classification: "Filtered Out",
      verification: "Fixture",
      discovery: {
        provider: "fixture",
        query: "fixture",
        resultUrl: url,
        checked: new Date().toISOString(),
        method: "test",
      },
      reasons: ["Missing eligibility review"],
    }),
  );
  db.close();
  const env = { ...process.env, CANNON_TEST_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch(
    process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]), env }
      : { args: ["."], env },
  );
  try {
    let page = await app.firstWindow();
    await page.evaluate(async () => {
      const p = (await window.cannon.call("profiles")).profiles;
      p.job = {
        ...p.job,
        enabled: true,
        automaticDiscovery: false,
        skills: "TypeScript",
        targetLocation: "Toronto",
        jobTitleKeywords: "developer",
        workHistory: "Fixture professional history",
      };
      await window.cannon.call("profilesSave", p);
    });
    await page.reload();
    await page.getByText("JOB SEARCH", { exact: true }).click();
    await page
      .getByRole("button", { name: "Profiles & settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "2. Job Search profile", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("skills", { exact: true }).inputValue(),
      "TypeScript",
    );
    assert.equal(
      await page.getByLabel("discoveryPolicy", { exact: true }).count(),
      0,
    );
    await page
      .getByLabel("independentSkills", { exact: true })
      .fill("Fixture independent TypeScript debugging");
    await page
      .getByLabel("I reviewed the supplied profile facts", { exact: false })
      .check();
    await page
      .getByLabel("Opportunity to review", { exact: true })
      .selectOption(url);
    assert(
      !(await page
        .getByLabel(
          "I verified this source belongs to the organization and is its official opportunity",
          { exact: true },
        )
        .isChecked()),
    );
    await page
      .getByLabel(
        "I verified this source belongs to the organization and is its official opportunity",
        { exact: true },
      )
      .check();
    await page
      .getByLabel("Eligibility decision", { exact: true })
      .selectOption("yes");
    await page
      .getByLabel("Qualification comparison", { exact: true })
      .fill(
        "Fixture requirements compared against verified onboarding and debugging history.",
      );
    assert(
      await page
        .getByRole("button", {
          name: "Confirm opportunity review",
          exact: true,
        })
        .isDisabled(),
    );
    await page
      .getByLabel("Confirm requirements review", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Confirm opportunity review", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Save profiles and rerun enabled searches",
        exact: true,
      })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Strong Matches" })
      .waitFor();
    const p = await page.evaluate(() => window.cannon.call("profiles"));
    const review = JSON.parse(p.profiles.job.discoveryPolicy).reviews[url];
    assert.equal(review.eligible, true);
    assert(review.profileSnapshot);
    assert.equal(review.sourceSnapshot, text);
    await page.screenshot({ path: "test-results/eligibility-settings.png" });
    await app.close();
    app = await electron.launch(
      process.argv[2]
        ? { executablePath: path.resolve(process.argv[2]), env }
        : { args: ["."], env },
    );
    page = await app.firstWindow();
    const persisted = await page.evaluate(() => window.cannon.call("profiles"));
    assert.equal(
      persisted.profiles.job.independentSkills,
      "Fixture independent TypeScript debugging",
    );
    console.log(
      "PASS Settings reuse, no JSON, guarded confirmation, save/rerun and restart persistence",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
