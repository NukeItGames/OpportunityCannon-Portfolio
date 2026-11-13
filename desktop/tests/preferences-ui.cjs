const { _electron: electron } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const env = {
    ...process.env,
    CANNON_TEST_DATA: fs.mkdtempSync(
      path.resolve(
        process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
        "preferences-",
      ),
    ),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(
    process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]), env }
      : { args: ["."], env },
  );
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => console.error("UI error", e));
    await page.evaluate(async () => {
      const p = (await window.cannon.call("profiles")).profiles;
      p.job.enabled = true;
      p.vc.enabled = true;
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
    assert(
      await page
        .getByLabel("Automatically find sources when I press Search", {
          exact: true,
        })
        .isChecked(),
    );
    await page
      .getByLabel("Automatically find sources when I press Search", {
        exact: true,
      })
      .uncheck();
    await page.getByLabel("Search queries per run", { exact: true }).fill("3");
    await page
      .getByRole("button", { name: "Add target location", exact: true })
      .click();
    await page.getByLabel("location 1 city", { exact: true }).fill("Kyoto");
    await page.getByLabel("location 1 country", { exact: true }).fill("Japan");
    await page.getByLabel("Remote", { exact: true }).check();
    await page.getByLabel("employmentTypes", { exact: true }).fill("Contract");
    await page.getByLabel("industries", { exact: true }).fill("Education");
    await page
      .getByRole("button", { name: "Add official source", exact: true })
      .click();
    await page
      .getByLabel("source 1 provider", { exact: true })
      .selectOption("ashby");
    await page
      .getByLabel("source 1 address", { exact: true })
      .fill("fictional-kyoto");
    await page
      .getByRole("button", { name: "3. VC Funding profile", exact: true })
      .click();
    assert(
      await page
        .getByLabel("Automatically find sources when I press Search", {
          exact: true,
        })
        .isChecked(),
    );
    await page.getByLabel("targetCountries", { exact: true }).fill("Japan");
    await page
      .getByRole("button", { name: "Add official source", exact: true })
      .click();
    await page
      .getByLabel("source 1 name", { exact: true })
      .fill("Fictional grant");
    await page
      .getByLabel("source 1 address", { exact: true })
      .fill("https://fictional.example/apply");
    await page
      .getByText("Discovery thresholds and exclusions", { exact: true })
      .click();
    await page.getByLabel("fundingCurrency", { exact: true }).fill("JPY");
    await page.getByLabel("minGrant", { exact: true }).fill("5000000");
    await page
      .getByRole("button", {
        name: "4. Review, save, and browser integration",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Save all profiles", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Profiles saved locally" })
      .waitFor();
    const p = (await page.evaluate(() => window.cannon.call("profiles")))
      .profiles;
    assert.deepEqual(p.job.locations, [
      { city: "Kyoto", region: "", country: "Japan" },
    ]);
    assert.equal(p.job.boards[0].board, "fictional-kyoto");
    assert.equal(p.job.automaticDiscovery, false);
    assert.equal(p.job.discoveryQueryLimit, 3);
    assert.equal(p.vc.automaticDiscovery, true);
    assert.equal(p.vc.fundingSources[0].url, "https://fictional.example/apply");
    assert.equal(JSON.parse(p.vc.discoveryPolicy).fundingCurrency, "JPY");
    assert.equal(p.vc.workModes, undefined);
    assert.equal(p.job.targetCountries, undefined);
    console.log(
      "PASS structured locations, remote, arbitrary industry/employment, source and currency editing; mode isolation",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
