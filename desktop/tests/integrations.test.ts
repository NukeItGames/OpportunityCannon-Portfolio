import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, key } from "../electron/core";
import { sync, validateAnswer, digest } from "../electron/integrations";
import { search } from "../electron/search";
test("AI schema rejects invalid output", () => {
  assert.throws(() => validateAnswer({ answer: "unvalidated" }));
  assert.deepEqual(
    validateAnswer({ answer: "Draft", missing: ["Revenue"], uncertain: true }),
    { answer: "Draft", missing: ["Revenue"], uncertain: true },
  );
});
test("mock Sheets: append once, deduplicate repeat, preserve concurrent remote edits", async () => {
  const original = globalThis.fetch;
  const db = new Store(":memory:");
  const url = "https://example.com/application",
    id = "vc:" + key(url);
  db.put({
    id,
    kind: "vc",
    name: "TEST FIXTURE",
    company: "TEST",
    url,
    score: 0,
    status: "New",
    checked: "2026-11-08",
    details: "test",
    verification: "test",
  });
  let rows: any[] = [];
  let appends = 0;
  globalThis.fetch = async (input: any, init: any) => {
    const u = String(input);
    let body: any;
    if (u.includes("?fields="))
      body = { sheets: [{ properties: { title: "Cannon Desktop VC" } }] };
    else if (u.includes(":append")) {
      assert.equal(init.method, "POST");
      assert(u.includes("valueInputOption=RAW"));
      rows.push(...JSON.parse(init.body).values);
      appends++;
      body = {};
    } else {
      assert(!init.method);
      body = { values: rows };
    }
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const a = await sync(db, "vc", "TEST ONLY", "test-spreadsheet");
    assert.equal(a.appended, 1);
    assert.equal(
      (await sync(db, "vc", "TEST ONLY", "test-spreadsheet")).appended,
      0,
    );
    rows[0][5] = "Applied";
    rows[0][10] = "remote-change";
    db.status(id, "Saved");
    const b = await sync(db, "vc", "TEST ONLY", "test-spreadsheet");
    assert.equal(b.conflicts.length, 1);
    assert.equal(appends, 1);
    assert.equal(db.list()[0].status, "Saved");
    assert.equal(rows[0][5], "Applied");
  } finally {
    globalThis.fetch = original;
    db.db.close();
  }
});
test("source failures are visible and do not create production opportunities", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  const messages: string[] = [];
  let saves = 0;
  try {
    await search(
      "job",
      [],
      { boards: [{ type: "lever", board: "test-fixture" }] },
      (m) => messages.push(m),
      () => saves++,
    );
    assert.equal(saves, 0);
    assert(messages.some((m) => m.includes("HTTP 503")));
  } finally {
    globalThis.fetch = original;
  }
});
