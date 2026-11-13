const { chromium, _electron: electron } = require("@playwright/test");
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict"),
  cp = require("child_process");
(async () => {
  const channel = process.env.CANNON_BROWSER || "msedge";
  const registry =
    "HKCU\\Software\\" +
    (channel === "chrome" ? "Google\\Chrome" : "Microsoft\\Edge") +
    "\\NativeMessagingHosts\\com.opportunitycannon.bridge";
  let previous = null;
  try {
    previous = cp
      .execFileSync("reg", ["query", registry, "/ve"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .match(/REG_SZ\s+(.+)/)?.[1]
      .trim();
  } catch {}
  const host = path.resolve(
    process.env.CANNON_NATIVE_DIR || "build/native",
    "host.json",
  );
  fs.writeFileSync(
    host,
    JSON.stringify({
      name: "com.opportunitycannon.bridge",
      description: "Test bridge",
      path: path.resolve(
        process.env.CANNON_NATIVE_DIR || "build/native",
        "CannonHost.exe",
      ),
      type: "stdio",
      allowed_origins: ["chrome-extension://aniflijjcgbekbpcpmkljoeflifjhobl/"],
    }),
  );
  cp.execFileSync("reg", [
    "add",
    registry,
    "/ve",
    "/t",
    "REG_SZ",
    "/d",
    host,
    "/f",
  ]);
  let app, context;
  try {
    const userData = fs.mkdtempSync(
      path.resolve(
        process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
        "handoff-",
      ),
    );
    const env = { ...process.env, CANNON_TEST_DATA: userData };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch(
      process.argv[2]
        ? { executablePath: path.resolve(process.argv[2]), env }
        : { args: ["."], env },
    );
    let window = await app.firstWindow();
    await window.evaluate(async () => {
      const p = (await window.cannon.call("profiles")).profiles;
      p.shared.name = "Native fixture";
      p.shared.email = "fixture@example.test";
      p.job.enabled = true;
      p.vc.enabled = true;
      p.vc.company = "VC fixture";
      await window.cannon.call("profilesSave", p);
    });
    await app.evaluate(({ app, safeStorage, shell }) => {
      shell.openExternal = async (url) => {
        global.openedURL = url;
      };
      const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
      const db = new DatabaseSync(
        process
          .getBuiltinModule("path")
          .join(app.getPath("userData"), "opportunities.sqlite"),
      );
      for (const kind of ["job", "vc"]) {
        const body = {
          id: kind + ":fixture",
          kind,
          name: "Fixture",
          company: "Fixture",
          url: "https://example.test/" + kind,
          score: 0,
          status: "New",
          checked: "",
          details: "",
          verification: "Synthetic fixture",
        };
        db.prepare("INSERT INTO opportunities VALUES (?,?)").run(
          body.id,
          "dpapi:" +
            safeStorage.encryptString(JSON.stringify(body)).toString("base64"),
        );
      }
      db.close();
    });
    const extensionDir = fs.mkdtempSync(
      path.resolve(
        process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
        "extension-",
      ),
    );
    fs.cpSync(process.env.CANNON_EXTENSION_DIR || "extension", extensionDir, {
      recursive: true,
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionDir, "manifest.json")),
    );
    manifest.host_permissions = ["https://*/*"];
    fs.writeFileSync(
      path.join(extensionDir, "manifest.json"),
      JSON.stringify(manifest),
    );
    // A pipe caller without the per-account host secret cannot obtain tasks.
    const pipe =
      String.raw`\\.\pipe\opportunity-cannon-` +
      require("crypto")
        .createHash("sha256")
        .update(process.env.USERPROFILE || "")
        .digest("hex")
        .slice(0, 24);
    const denied = await new Promise((resolve, reject) => {
      const socket = require("net").connect(pipe, () =>
        socket.write(
          JSON.stringify({ auth: "invalid", message: { op: "poll" } }) + "\n",
        ),
      );
      let body = "";
      socket.on("data", (c) => (body += c));
      socket.on("end", () => resolve(JSON.parse(body)));
      socket.on("error", reject);
    });
    assert(denied.error);
    context = await chromium.launchPersistentContext(
      fs.mkdtempSync(
        path.resolve(
          process.env.CANNON_ACCEPTANCE_ROOT || ".test-data",
          "edge-handoff-",
        ),
      ),
      {
        channel,
        ignoreDefaultArgs: ["--disable-extensions"],
        headless: false,
        args:
          channel === "chrome"
            ? ["--enable-unsafe-extension-debugging"]
            : [
                "--enable-unsafe-extension-debugging",
                "--disable-extensions-except=" + extensionDir,
                "--load-extension=" + extensionDir,
              ],
      },
    );
    await context.route("https://example.test/**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: fs.readFileSync("tests/form.html", "utf8"),
      }),
    );
    if (channel === "chrome") {
      const cdp = await context.browser().newBrowserCDPSession();
      const loaded = await cdp.send("Extensions.loadUnpacked", {
        path: extensionDir,
      });
      assert.equal(loaded.id, "aniflijjcgbekbpcpmkljoeflifjhobl");
      const popup = await context.newPage();
      await popup.goto("chrome-extension://" + loaded.id + "/popup.html");
      console.log(
        "Chrome connect",
        await popup.evaluate(() =>
          chrome.runtime.sendMessage({ op: "connect" }),
        ),
      );
    }
    if (channel !== "chrome" && !context.serviceWorkers().length)
      await context.waitForEvent("serviceworker");

    for (let i = 0; i < 25; i++) {
      const s = await window.evaluate(() =>
        window.cannon.call("browserStatus"),
      );
      if (s.connected) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(
      (await window.evaluate(() => window.cannon.call("browserStatus")))
        .connected,
      true,
    );
    for (const kind of ["job", "vc"]) {
      await window.evaluate(
        (kind) => window.cannon.call("open", kind + ":fixture", true),
        kind,
      );
      assert.equal(
        await app.evaluate(() => global.openedURL),
        "https://example.test/" + kind,
      );
      if (kind === "vc") {
        await app.close();
        app = await electron.launch(
          process.argv[2]
            ? { executablePath: path.resolve(process.argv[2]), env }
            : { args: ["."], env },
        );
        window = await app.firstWindow();
      }
      const page = await context.newPage();
      await page.goto("https://example.test/" + kind);
      await page.waitForFunction(
        () => document.querySelector("#name").value === "Native fixture",
        undefined,
        { timeout: 15000 },
      );
      assert.equal(
        await page.locator("input[type=email]").inputValue(),
        "fixture@example.test",
      );
      assert.equal(await page.evaluate(() => window.submitted), undefined);
      const state = await window.evaluate(
        (kind) => window.cannon.call("state", kind),
        kind,
      );
      assert.equal(state.items[0].status, "New");
      console.log(
        "PASS " +
          channel +
          " full native handoff " +
          kind +
          "; default-browser dispatch intercepted, HTTPS form locally routed",
      );
    }
  } finally {
    if (context) await context.close();
    if (app) await app.close();
    if (previous)
      cp.execFileSync("reg", [
        "add",
        registry,
        "/ve",
        "/t",
        "REG_SZ",
        "/d",
        previous,
        "/f",
      ]);
    else cp.execFileSync("reg", ["delete", registry, "/f"]);
    let restored = null;
    try {
      restored = cp.execFileSync('reg', ['query',registry,'/ve'], {encoding:'utf8',stdio:['ignore','pipe','ignore']}).match(/REG_SZ\s+(.+)/)?.[1].trim() || null;
    } catch {}
    assert.equal(restored, previous, 'Native registration must match pre-test value');
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
