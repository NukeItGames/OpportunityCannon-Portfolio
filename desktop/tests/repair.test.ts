import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, opportunityIdentity, Opportunity } from "../electron/core";
import { mergeImport, previewImport } from "../electron/profiles";
import { boundedText } from "../electron/http";
import { vc } from "../electron/search";
import { fundingDirectory } from "../electron/discovery";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fixture = (id: string, url: string, status = "New"): Opportunity => ({
  id,
  url,
  status,
  kind: "job",
  name: "Fixture",
  company: "Fixture",
  score: 0,
  checked: "",
  details: "",
  verification: "Fixture",
});
const archive = (o: Opportunity, history: any[] = []) => ({
  opportunities: [{ id: o.id, body: o }],
  settings: [],
  history,
  packets: [],
});
test("audit exact failure: Applied Lever plus alternate ID /apply New backup stays one protected record after restart and rediscovery", () => {
  const dir = mkdtempSync(join(tmpdir(), "cannon-regression-")),
    path = join(dir, "test.sqlite");
  let db = new Store(path);
  try {
    db.put(fixture("existing", "https://jobs.lever.co/fixture/123"));
    db.status("existing", "Applied");
    db.notes("existing", "Preserve note", "tomorrow");
    const incoming = archive(
      fixture(
        "imported",
        "https://jobs.lever.co/fixture/123/apply?utm_source=test",
        "New",
      ),
      [{ opportunity: "imported", changed: "2026-01-01", status: "Saved" }],
    );
    assert.equal(previewImport(db, incoming).conflictingOpportunities, 1);
    mergeImport(db, incoming);
    mergeImport(db, incoming);
    assert.equal(db.list().length, 1);
    assert.equal(db.list()[0].status, "Applied");
    assert.equal(db.list()[0].notes, "Preserve note");
    assert.equal(db.snapshot().history.length, 2);
    assert(
      db.snapshot().history.every((h: any) => h.opportunity === "existing"),
    );
    db.db.close();
    db = new Store(path);
    db.put(
      fixture(
        "rediscovered",
        "https://jobs.lever.co/fixture/123?source=search",
      ),
    );
    assert.equal(db.list().length, 1);
    assert(db.isProtected(db.list()[0]));
    assert.equal(db.list()[0].status, "Applied");
  } finally {
    db.db.close();
    rmSync(dir, { recursive: true });
  }
});
test("Greenhouse aliases, Ashby application, tracking: distinct board/posting/cohort/query identities retained", () => {
  const id = (s: string) => opportunityIdentity("job", s);
  assert.equal(
    id("https://boards.greenhouse.io/fixture/jobs/123?gh_jid=123"),
    id("https://job-boards.greenhouse.io/fixture/jobs/123"),
  );
  assert.equal(
    id("https://boards.greenhouse.io/fixture?gh_jid=123"),
    id("https://job-boards.greenhouse.io/fixture/jobs/123"),
  );
  assert.equal(
    id("https://jobs.ashbyhq.com/team/123/application"),
    id("https://jobs.ashbyhq.com/team/123"),
  );
  assert.notEqual(
    id("https://jobs.lever.co/team/123"),
    id("https://jobs.lever.co/team/456"),
  );
  assert.notEqual(
    id("https://job-boards.greenhouse.io/other/jobs/123"),
    id("https://job-boards.greenhouse.io/team/jobs/123"),
  );
  assert.equal(
    id("https://example.test/apply?b=2&a=1&fbclid=test"),
    id("https://example.test/apply?a=1&b=2"),
  );
  assert.notEqual(
    opportunityIdentity("vc", "https://fund.test/apply?cohort=2026"),
    opportunityIdentity("vc", "https://fund.test/apply?cohort=2027"),
  );
});
test("Rejected roundtrip and protected imports strengthen New; explicit reviewed reopening required", () => {
  const db = new Store(":memory:");
  db.put(fixture("one", "https://example.test/1"));
  db.status("one", "Rejected");
  assert.throws(() => db.status("one", "New"));
  assert.throws(() => db.status("one", "Saved"));
  const target = new Store(":memory:");
  mergeImport(target, db.snapshot());
  assert.equal(target.list()[0].status, "Rejected");
  db.status("one", "New", true);
  assert.equal(db.list()[0].status, "New");
  assert.equal(db.snapshot().history.length, 2);
  mergeImport(db, target.snapshot());
  assert.equal(db.list()[0].status, "Rejected");
  db.db.close();
  target.db.close();
});
test("startup collapses existing legacy semantic duplicates and remaps all status history", () => {
  const dir = mkdtempSync(join(tmpdir(), "cannon-legacy-")),
    path = join(dir, "test.sqlite");
  let db = new Store(path);
  for (const o of [
    fixture("a", "https://jobs.lever.co/team/123", "Applied"),
    fixture("b", "https://jobs.lever.co/team/123/apply"),
  ])
    db.db
      .prepare("INSERT INTO opportunities VALUES (?,?)")
      .run(o.id, db.encode(o));
  db.db
    .prepare("INSERT INTO history(opportunity,changed,status) VALUES (?,?,?)")
    .run("b", "2026-01-01", "Saved");
  db.db.close();
  db = new Store(path);
  assert.equal(db.list().length, 1);
  assert.equal(db.list()[0].status, "Applied");
  assert.equal(db.snapshot().history[0].opportunity, "a");
  db.db.close();
  rmSync(dir, { recursive: true });
});
test("malformed imports and ID collisions roll back without loss", () => {
  const db = new Store(":memory:");
  db.put(fixture("one", "https://example.test/1"));
  const before = db.snapshot();
  for (const o of [
    fixture("two", "http://example.test/1"),
    fixture("one", "https://example.test/2"),
    fixture("two", "https://example.test/2", "invented"),
  ])
    assert.throws(() => mergeImport(db, archive(o)));
  assert.deepEqual(db.snapshot(), before);
  db.db.close();
});
test("email route requires pitch evidence or explicit review, generic contact is unknown and forms win", async () => {
  const base = { url: "https://example.test", name: "Investor" };
  const email = await vc({
    ...base,
    html: '<body><p>Send your startup pitch to <a href="mailto:pitch@example.test">our investment team</a></p></body>',
  });
  assert.equal(email.verification, "EMAIL ONLY");
  assert.equal(email.intakeRoute, "email");
  assert(email.evidence?.some((e) => e.quote.includes("startup pitch")));
  const unknown = await vc({
    ...base,
    html: '<p>Contact <a href="mailto:info@example.test">Info</a></p>',
  });
  assert.notEqual(unknown.verification, "EMAIL ONLY");
  const form = await vc({
    ...base,
    html: '<p>Send pitch <a href="mailto:pitch@example.test">here</a></p><form>Company founder<input><input><textarea></textarea></form>',
  });
  assert.equal(form.intakeRoute, "form");
});
test("observed consumer directory and funding toolkits cannot become opportunity sources", () => {
  assert(
    fundingDirectory(
      "https://founderstoday.org/startup-accelerators-2026/industry/consumer",
      "Consumer accelerators",
    ),
  );
  assert(
    fundingDirectory(
      "https://example.test/toolkits/startups",
      "Funding toolkit",
    ),
  );
  assert(!fundingDirectory("https://investor.test/apply", "Seed fund"));
});
test("streaming byte budget cancels oversized decompressed/chunked response before buffering all input", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(boundedText(response, 10), /size limit/);
  assert(cancelled);
  assert.equal(await boundedText(new Response("h�llo"), 20), "h�llo");
});

test("observed redirect aliases preserve funding application protection while unrelated programs remain distinct", () => {
  const db = new Store(":memory:");
  const applied = {
    ...fixture("fund", "https://investor.test/apply", "Applied"),
    kind: "vc" as const,
    identityUrls: [
      "https://investor.test",
      "https://forms.test/investor/program1",
    ],
  };
  db.put(applied);
  mergeImport(
    db,
    archive({
      ...applied,
      id: "new",
      url: "https://forms.test/investor/program1",
      identityUrls: [],
      status: "New",
    }),
  );
  assert.equal(db.list().length, 1);
  assert.equal(db.list()[0].status, "Applied");
  assert(db.isProtected(db.list()[0]));
  db.put({
    ...applied,
    id: "cohort2",
    url: "https://investor.test/program2",
    identityUrls: [],
    status: "New",
  });
  assert.equal(db.list().length, 2);
  db.db.close();
});

test("streaming limit also bounds a genuine locally served compressed response after decompression", async () => {
  const { createServer } = await import("node:http");
  const { gzipSync } = await import("node:zlib");
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Encoding": "gzip" });
    res.end(gzipSync(Buffer.alloc(100000, 65)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as any;
    const r = await fetch(`http://127.0.0.1:${address.port}`);
    await assert.rejects(boundedText(r, 1024), /size limit/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

test("rediscovery reconciliation rolls back alias deletion and history remapping when encryption fails", () => {
  let fail = false;
  const codec = {
    seal: (s: string) => {
      if (fail) throw Error("synthetic encryption failure");
      return s;
    },
    open: (s: string) => s,
  };
  const db = new Store(":memory:", codec);
  for (const o of [
    fixture("a", "https://jobs.lever.co/team/123", "Applied"),
    fixture("b", "https://jobs.lever.co/team/123/apply"),
  ])
    db.db
      .prepare("INSERT INTO opportunities VALUES (?,?)")
      .run(o.id, db.encode(o));
  db.db
    .prepare("INSERT INTO history(opportunity,changed,status) VALUES (?,?,?)")
    .run("b", "2026-01-01", "Saved");
  const before = db.snapshot();
  fail = true;
  assert.throws(
    () => db.put(fixture("new", "https://jobs.lever.co/team/123/apply")),
    /encryption failure/,
  );
  assert.deepEqual(db.snapshot(), before);
  db.db.close();
});
