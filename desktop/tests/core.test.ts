import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, key, canonical, blocked, Opportunity } from "../electron/core";
test("canonical identity, blocked investors and unsafe schemes", () => {
  assert.equal(
    key("https://example.com/apply?utm_source=test"),
    key("https://example.com/apply"),
  );
  assert.notEqual(
    key("https://example.com/apply?id=1"),
    key("https://example.com/apply?id=2"),
  );
  assert.throws(() => canonical("mailto:a@example.com"));
  assert.throws(() => canonical("https://127.0.0.1/private"));
  assert.ok(
    blocked("Fixture", "https://apply.example.test/form", "example.test"),
  );
  assert.equal(blocked("Fixture", "https://example.test/form"), false);
  assert.equal(
    blocked("Fixture", "https://unrelated-example.test/form", "example.test"),
    false,
  );
});
test("SQLite survives reopening and discovery cannot overwrite applied status", () => {
  const dir = mkdtempSync(join(tmpdir(), "cannon-"));
  const path = join(dir, "test.sqlite");
  let s = new Store(path);
  const o: Opportunity = {
    id: key("https://example.com/apply"),
    kind: "vc",
    name: "TEST FIXTURE",
    company: "TEST",
    url: "https://example.com/apply",
    score: 0,
    status: "New",
    checked: "2026-11-08",
    details: "test only",
    verification: "test only",
  };
  s.put(o);
  s.status(o.id, "Applied");
  s.db.close();
  s = new Store(path);
  assert.equal(s.list()[0].status, "Applied");
  s.put({ ...o, score: 50 });
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0].status, "Applied");
  assert.equal(s.list()[0].score, 50);
  assert.ok(s.list()[0].applied);
  assert.throws(() => s.status(o.id, "Submitted automatically"));
  s.db.close();
  rmSync(dir, { recursive: true });
});
