const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  fs.mkdirSync(".test-data", { recursive: true });
  const data = fs.mkdtempSync(
    path.resolve(
      process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
      "privacy-",
    ),
  );
  const env = { ...process.env, CANNON_TEST_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: path.resolve(process.argv[2]),
    env,
  });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "Set up Opportunity Cannon" })
      .waitFor();
    const p = await page.evaluate(() => window.cannon.call("profiles"));
    assert.equal(p.complete, false);
    assert.deepEqual(p.legacy, []);
    for (const section of ["shared", "job", "vc"])
      for (const [key, value] of Object.entries(p.profiles[section]))
        if (typeof value === "string")
          assert.equal(value, "", `Nonempty fresh field ${section}.${key}`);
    for (const mode of ["job", "vc"]) {
      const s = await page.evaluate(
        (mode) => window.cannon.call("state", mode),
        mode,
      );
      assert.equal(s.items.length, 0);
      assert.deepEqual(s.log, []);
      assert.equal(s.dataPath, data);
    }
    const credentials = await page.evaluate(() =>
      window.cannon.call("integrationStatus"),
    );
    assert.equal(credentials.hasKey, false);
    assert.equal(credentials.connected, false);
    assert.equal(credentials.googleClientId, "");
    assert.equal(credentials.googleSheetId, "");
    const fields = [];
    for (let step = 0; step < 4; step++) {
      if (process.argv[3] !== "original" && [1, 2].includes(step)) {
        await page
          .getByText(
            `Set up ${step === 1 ? "Job Search" : "VC Funding"} (optional)`,
            { exact: true },
          )
          .click();
      }
      fields.push(
        await page.locator(".profile-manager label").allTextContents(),
      );
      if (step < 3)
        await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    fs.writeFileSync(
      path.join(data, "questionnaire.json"),
      JSON.stringify(fields, null, 2),
    );
    if (process.argv[3] !== "original") {
      assert(
        !/Legacy Product|Unconfigured City/i.test(await page.locator("body").innerText()),
      );
      assert.deepEqual(p.profiles.job.boards, []);
      assert.equal(
        await app.evaluate(({ app }) => app.getPath("userData")),
        data,
      );
    }
    console.log(
      "PASS: extracted installer clean profiles, empty history/research/credentials and questionnaire inspection" +
        (process.argv[3] === "original"
          ? " (original 0.2.0)"
          : " (generic build)"),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
