import { test } from "node:test";
import assert from "node:assert/strict";
import { jobs, vc } from "../electron/search";
import { emptyProfiles, packetFields } from "../electron/profiles";
test("fresh profiles contain no identity, employer selection or personal search assumptions", () => {
  const p = emptyProfiles();
  assert(Object.values(p.shared).every((v) => v === ""));
  assert.deepEqual(p.job.boards, []);
  assert.equal(p.job.targetLocation, "");
  assert.equal(p.job.enabled, false);
  assert.equal(p.vc.enabled, false);
  p.shared.name = "FICTIONAL FIXTURE";
  assert.deepEqual(packetFields(p, "vc", "https://example.test/apply"), {
    customAnswers: [],
  });
});
test("job filters are optional and work outside the original city and profession", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          text: "Nurse",
          applyUrl: "https://example.test/nurse",
          categories: { location: "Berlin" },
          descriptionPlain: "Care delivery",
        },
        {
          text: "Warehouse Associate",
          applyUrl: "https://example.test/warehouse",
          categories: { location: "Unconfigured City" },
          descriptionPlain: "Warehouse",
        },
      ]),
    );
  try {
    assert.equal(
      (await jobs({ type: "lever", board: "fixture" }, "")).length,
      2,
    );
    const selected = await jobs({ type: "lever", board: "fixture" }, "", {
      targetLocation: "Berlin",
      jobTitleKeywords: "nurse",
    });
    assert.equal(selected.length, 2);
    assert(selected[1].reasons?.includes("Location mismatch"));
    assert.equal(selected[0].name, "Nurse");
  } finally {
    globalThis.fetch = original;
  }
});
test("funding sector, stage and region ranking use supplied preferences", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      "<html><body>Healthcare growth funding in Berlin<form><input></form></body></html>",
    );
  try {
    const seed = { name: "Fictional Fund", url: "https://example.test/apply" };
    const generic = await vc(seed);
    const personalized = await vc(seed, {
      productKeywords: "healthcare",
      stageKeywords: "growth",
      targetRegion: "Berlin",
    });
    assert.equal(generic.score, 0);
    assert.equal(generic.classification, "Requires Verification");
    assert.equal(personalized.score, 0);
    assert(personalized.reasons?.some((x) => x.includes("intake")));
  } finally {
    globalThis.fetch = original;
  }
});
