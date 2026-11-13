import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../electron/core";
import { BrowserBridge } from "../electron/browser";
test("single-use URL-bound tasks, expiry, restart, superseding and invalid payloads", () => {
  const db = new Store(":memory:");
  const b = new BrowserBridge(db);
  b.queue("https://example.test/app", "job", "j");
  let t = b.tasks()[0];
  assert.throws(() =>
    b.message({ op: "claim", ...t, url: "https://evil.test" }, () => ({})),
  );
  assert.throws(() =>
    b.message({ op: "claim", ...t, nonce: "wrong" }, () => ({})),
  );
  assert.deepEqual(
    b.message({ op: "claim", ...t }, () => ({ name: "Fixture" })).fields,
    { name: "Fixture" },
  );
  assert.throws(() =>
    new BrowserBridge(db).message({ op: "claim", ...t }, () => ({})),
  );
  b.queue(t.url, "job", "j");
  assert.equal(b.tasks().length, 1);
  assert.notEqual(b.tasks()[0].id, t.id);
  t = b.tasks()[0];
  b.message({ op: "ack", ...t }, () => ({}));
  assert.equal(b.tasks().length, 0);
  b.queue(t.url, "vc", "v");
  t = b.tasks()[0];
  db.set("browser-tasks-v1", [{ ...t, expires: 0 }]);
  assert.equal(b.tasks().length, 0);
  assert.throws(() => b.message({ op: "bad" }, () => ({})));
  assert.throws(() =>
    b.message({ op: "poll", junk: "x".repeat(9000) }, () => ({})),
  );
  db.db.close();
});

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
test("stable extension identity and native host rejects unauthorized origin / oversized framing", () => {
  const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
  const id = [
    ...createHash("sha256")
      .update(Buffer.from(manifest.key, "base64"))
      .digest()
      .subarray(0, 16),
  ]
    .map((b) => String.fromCharCode(97 + (b >> 4), 97 + (b & 15)))
    .join("");
  assert.equal(id, JSON.parse(readFileSync("native/identity.json", "utf8")).id);
  assert(
    readFileSync("native/Host.cs", "utf8").includes(
      "chrome-extension://" + id + "/",
    ),
  );
  if (process.platform === "win32") {
    const invalid = spawnSync(
      "build/native/CannonHost.exe",
      ["chrome-extension://unauthorized/"],
      { input: Buffer.from([2, 0, 0, 0, 123, 125]), timeout: 5000 },
    );
    assert.equal(invalid.stdout.length, 0);
    assert.equal(invalid.status, 0);
    const large = Buffer.alloc(4);
    large.writeUInt32LE(100000);
    const oversized = spawnSync(
      "build/native/CannonHost.exe",
      ["chrome-extension://" + id + "/"],
      { input: large, timeout: 5000 },
    );
    assert.equal(oversized.stdout.length, 0);
    assert.equal(oversized.status, 0);
  }
});
