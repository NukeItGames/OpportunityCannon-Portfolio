const { _electron: electron } = require("@playwright/test");
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
const { DatabaseSync } = require("node:sqlite");
(async () => {
  const root = fs.mkdtempSync(
    path.resolve(
      process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
      "repair-installed-",
    ),
  );
  const data = path.join(root, "data");
  fs.mkdirSync(data);
  const legacy = path.join(root, "import.sqlite");
  const imported = new DatabaseSync(legacy);
  imported.exec(
    "CREATE TABLE opportunities(id TEXT PRIMARY KEY,body TEXT);CREATE TABLE settings(id TEXT PRIMARY KEY,body TEXT);CREATE TABLE history(id INTEGER PRIMARY KEY,opportunity TEXT,changed TEXT,status TEXT);CREATE TABLE packets(id INTEGER PRIMARY KEY,created TEXT,body TEXT)",
  );
  const record = {
    id: "prior",
    kind: "job",
    name: "Protected fixture",
    company: "Fixture",
    url: "https://jobs.lever.co/fixture/123",
    status: "Applied",
    score: 0,
    checked: new Date().toISOString(),
    details: "",
    verification: "Synthetic fixture",
    classification: "Requires Verification",
  };
  imported
    .prepare("INSERT INTO opportunities VALUES (?,?)")
    .run(
      "new-alias",
      JSON.stringify({
        ...record,
        id: "new-alias",
        url: record.url + "/apply?utm_source=backup",
        status: "New",
      }),
    );
  imported.close();
  const env = { ...process.env, CANNON_TEST_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch(
      process.argv[2]
        ? { executablePath: path.resolve(process.argv[2]), env }
        : { args: ["."], env },
    );
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.evaluate(async () => {
      let p = (await window.cannon.call("profiles")).profiles;
      p.job.enabled = true;
      await window.cannon.call("profilesSave", p);
    });
    await app.evaluate(({ app, safeStorage }, record) => {
      const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
      const db = new DatabaseSync(
        process
          .getBuiltinModule("path")
          .join(app.getPath("userData"), "opportunities.sqlite"),
      );
      db.prepare("INSERT INTO opportunities VALUES (?,?)").run(
        record.id,
        "dpapi:" +
          safeStorage.encryptString(JSON.stringify(record)).toString("base64"),
      );
      db.prepare(
        "INSERT INTO history(opportunity,changed,status) VALUES (?,?,?)",
      ).run(record.id, "2026-11-01", "Applied");
      const email = {...record, id:'email-only',kind:'vc',status:'New',name:'Email fixture',url:'https://fixture.test/contact',verification:'EMAIL ONLY',intakeRoute:'email'};
      db.prepare('INSERT INTO opportunities VALUES (?,?)').run(email.id, 'dpapi:' + safeStorage.encryptString(JSON.stringify(email)).toString('base64'));
      db.close();
    }, record);
    for (const fill of [false,true]) await assert.rejects(page.evaluate(fill => window.cannon.call('open','email-only',fill),fill), /EMAIL ONLY/);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, legacy);
    let preview = await page.evaluate(() =>
      window.cannon.call("backupPreview", ""),
    );
    assert.equal(preview.conflictingOpportunities, 1);
    await page.evaluate(() => window.cannon.call("backupMerge"));
    let state = await page.evaluate(() => window.cannon.call("state", "job"));
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].status, "Applied");
    await assert.rejects(
      page.evaluate(() => window.cannon.call("open", "prior", true)),
      /blocked/,
    );
    await assert.rejects(
      page.evaluate(() => window.cannon.call("status", "prior", "New")),
      /explicitly confirm/,
    );
    await page.evaluate(() =>
      window.cannon.call("status", "prior", "Rejected"),
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    state = await page.evaluate(() => window.cannon.call("state", "job"));
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].status, "Rejected");
    assert.equal(
      (await page.evaluate(() => window.cannon.call("history", "prior")))
        .length,
      2,
    );
    assert(
      !fs
        .readFileSync(path.join(data, "opportunities.sqlite"))
        .includes(Buffer.from("Protected fixture")),
    );
    assert(
      await app.evaluate(({ safeStorage }) =>
        safeStorage.isEncryptionAvailable(),
      ),
    );
    await page.getByText("JOB SEARCH", { exact: true }).click();
    await page.locator("select").last().selectOption("Rejected");
    await page.getByRole("heading", { name: "Protected fixture" }).waitFor();
    assert(
      await page
        .getByRole("button", { name: "OPEN APPLICATION", exact: true })
        .isDisabled(),
    );
    await page.screenshot({ path: "test-results/repair-installed.png" });
    console.log(
      "PASS installed semantic backup collision, Applied open blocked, reviewed reopening guard, Rejected UI/history/restart, DPAPI encryption; data=" +
        data,
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
