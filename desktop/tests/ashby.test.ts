// Fictional test configuration; never used as application defaults.
import { test } from "node:test";
import assert from "node:assert/strict";
import { jobs } from "../electron/search";
test("Ashby official feed and expired posting stay filtered with evidence", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        jobs: [
          {
            title: "Software Engineer",
            applyUrl: "https://jobs.ashbyhq.com/example/123/application",
            location: "Toronto",
            descriptionHtml: "TypeScript development",
            validThrough: "2020-01-01",
          },
        ],
      }),
    );
  try {
    const [o] = await jobs({ type: "ashby", board: "example" }, "TypeScript", {
      targetLocation: "Toronto",
      jobTitleKeywords: "software",
    });
    assert.equal(o.classification, "Filtered Out");
    assert(o.reasons?.some((x) => x.includes("expired")));
    assert(o.evidence?.length);
  } finally {
    globalThis.fetch = old;
  }
});
