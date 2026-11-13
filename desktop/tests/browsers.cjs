const { chromium, _electron: electron } = require("@playwright/test");
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
(async () => {
  fs.mkdirSync(".test-data", { recursive: true });
  for (const channel of ["chrome", "msedge"]) {
    const dir = fs.mkdtempSync(path.resolve(".test-data/" + channel + "-"));
    const context = await chromium.launchPersistentContext(dir, {
      channel,
      headless: false,
      args: [
        "--disable-extensions-except=" + path.resolve("extension"),
        "--load-extension=" + path.resolve("extension"),
      ],
    });
    try {
      const page = await context.newPage();
      await page.goto("about:blank");
      await page.setContent(fs.readFileSync("tests/form.html", "utf8"));
      await page.addScriptTag({ path: "extension/fill.js" });
      const result = await page.evaluate(() =>
        fillVerified({
          name: "Fixture",
          email: "fixture@example.test",
          phone: "5550100",
          workHistory: "Verified history",
          education: "Verified education",
          skills: "Testing",
          customAnswers: [
            { label: "Available?", type: "text", value: "Yes" },
            { label: "Remote", type: "checkbox", value: "true" },
            { label: "Ambiguous", type: "text", value: "One" },
            { label: "Ambiguous", type: "text", value: "Two" },
          ],
        }),
      );
      assert.equal(await page.locator("#name").inputValue(), "Fixture");
      assert.equal(
        await page.locator("[name=available][value=yes]").isChecked(),
        true,
      );
      assert.equal(
        await page.getByLabel("I agree to terms").isChecked(),
        false,
      );
      assert.equal(
        await page.getByLabel("Ambiguous", { exact: true }).inputValue(),
        "",
      );
      assert.equal(await page.evaluate(() => window.submitted), undefined);
      await page.locator("#next").click();
      await page.evaluate(() =>
        fillVerified({ traction: "Verified traction" }),
      );
      assert.equal(
        await page.getByLabel("Traction").inputValue(),
        "Verified traction",
      );
      console.log(
        "PASS real " +
          channel +
          ": common fields, radio, checkbox, dynamic next step, ambiguous answers and no submit; extension workers=" +
          context.serviceWorkers().length,
      );
    } finally {
      await context.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
