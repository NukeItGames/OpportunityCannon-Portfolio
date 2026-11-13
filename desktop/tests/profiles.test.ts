import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../electron/core";
import {
  emptyProfiles,
  packetFields,
  encryptBackup,
  decryptBackup,
  previewImport,
  mergeImport,
} from "../electron/profiles";
test("shared identity, domain isolation and exact application answer scope", () => {
  const p: any = emptyProfiles();
  p.job.enabled = true;
  p.vc.enabled = true;
  p.shared.email = "fixture@example.test";
  p.job.skills = "fixture skill";
  p.vc.company = "fixture startup";
  p.vc.customAnswers = [
    {
      label: "Question",
      value: "fixture",
      type: "text",
      url: "https://example.test/apply?id=1",
    },
    { label: "Unscoped", value: "manual", type: "text" },
  ];
  assert.equal(
    packetFields(p, "job", "https://example.test/apply").company,
    undefined,
  );
  assert.equal(
    packetFields(p, "vc", "https://example.test/apply").skills,
    undefined,
  );
  assert.equal(
    packetFields(p, "vc", "https://example.test/apply?id=1").customAnswers
      .length,
    1,
  );
  assert.equal(
    packetFields(p, "vc", "https://example.test/apply?id=2").customAnswers
      .length,
    0,
  );
  assert.equal(
    packetFields(p, "job", "https://example.test/apply").email,
    p.shared.email,
  );
  assert.equal(emptyProfiles().shared.email, "");
});
test("authenticated portable backup and safe merge preserve conflicting records and history", () => {
  const db = new Store(":memory:");
  db.set("profiles-v1", emptyProfiles());
  db.put({
    id: "fixture",
    kind: "job",
    name: "PRIVATE FIXTURE",
    company: "fixture",
    url: "https://example.test/apply",
    score: 0,
    status: "New",
    checked: "2026-01-01",
    details: "private fixture",
    verification: "fixture",
  });
  db.status("fixture", "Applied");
  db.packet({ packet: { fields: { name: "PRIVATE FIXTURE" } } });
  const raw = encryptBackup(db.snapshot(), "fixture password 123");
  assert(!raw.includes("PRIVATE FIXTURE"));
  const data = decryptBackup(raw, "fixture password 123");
  assert.throws(() => decryptBackup(raw, "wrong"));
  assert.throws(() => encryptBackup({}, "short"));
  const bad = JSON.parse(raw);
  bad.tag = Buffer.alloc(16).toString("base64");
  assert.throws(() =>
    decryptBackup(JSON.stringify(bad), "fixture password 123"),
  );
  const target = new Store(":memory:");
  assert.equal(previewImport(target, data).newOpportunities, 1);
  mergeImport(target, data);
  target.status("fixture", "Saved", true);
  mergeImport(target, data);
  assert.equal(target.list()[0].status, "Applied");
  assert.equal(target.snapshot().packets.length, 1);
  assert.equal(target.snapshot().history.length, 2);
  const before = target.snapshot();
  data.history.push({});
  assert.throws(() => mergeImport(target, data));
  assert.deepEqual(target.snapshot(), before);
  db.db.close();
  target.db.close();
});
