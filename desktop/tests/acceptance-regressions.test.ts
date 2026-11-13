import { test } from "node:test";
import assert from "node:assert/strict";
import { discoveryQueries, discoverSources } from "../electron/discovery";
import { jobs, search, vc } from "../electron/search";
import { classify } from "../electron/ranking";
import { Store, compareOpportunities } from "../electron/core";

test("later configured role/sector terms use available queries without leaking personal facts", () => {
  for (const mode of ["job", "vc"]) {
    const p = {
      jobTitleKeywords: "architect,designer,planner,landscape,interiors",
      productKeywords: "agriculture,food,climate,water,energy",
      company: "PRIVATE",
      discoveryQueryLimit: 4,
    };
    const queries = discoveryQueries(mode, p);
    assert.equal(queries.length, 4);
    for (const term of (mode === "job"
      ? p.jobTitleKeywords
      : p.productKeywords
    ).split(","))
      assert(
        queries.some((q) => q.includes(term)),
        term,
      );
    assert(!queries.join(" ").includes("PRIVATE"));
    assert(
      discoveryQueries(mode, { ...p, discoveryQueryLimit: 1 }).length === 1,
    );
  }
});

test("a long manual funding list cannot consume every automatic source slot", async () => {
  const previous = globalThis.fetch,
    calls: string[] = [];
  globalThis.fetch = async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("duckduckgo.com"))
      return new Response(
        '<a class="result__a" href="https://automatic.example/apply">Agriculture funding</a>',
      );
    return new Response(
      "<body>Agriculture seed funding<form>Company Startup Pitch<input><input><textarea></textarea></form></body>",
    );
  };
  try {
    const p = {
      automaticDiscovery: true,
      discoveryQueryLimit: 1,
      productKeywords: "agriculture",
      stageKeywords: "seed",
      limit: 2,
      fundingSources: Array.from({ length: 20 }, (_, i) => ({
        name: `Manual ${i}`,
        url: `https://manual${i}.example/apply`,
      })),
    };
    const saved: any[] = [],
      logs: string[] = [];
    await search(
      "vc",
      [],
      p,
      (s) => logs.push(s),
      (o) => saved.push(o),
    );
    assert.equal(saved.length, 2);
    assert(saved.some((o) => o.url === "https://manual0.example/apply"));
    assert(
      saved.some(
        (o) => o.url === "https://automatic.example/apply" && o.discovery,
      ),
    );
    assert(logs.some((s) => s.includes("1 custom and 1 discovered")));
    assert.equal(p.fundingSources.length, 20);
    calls.length = 0;
    saved.length = 0;
    await search(
      "vc",
      [],
      { ...p, automaticDiscovery: false },
      () => {},
      (o) => saved.push(o),
    );
    assert(saved.every((o) => o.url.startsWith("https://manual")));
    assert(!calls.some((url) => url.includes("duckduckgo")));
  } finally {
    globalThis.fetch = previous;
  }
});

test("public JobPosting form requirements participate in eligibility review without inventing answers", async () => {
  const html = `<body><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Designer", description: "Design accessible buildings.", jobLocation: { address: { addressLocality: "Lima" } } })}</script><form><label>Resume<input></label><label>Are you legally authorized to work in Peru?<select><option>Choose</option></select></label><label>Will you require sponsorship?<textarea></textarea></label><label>Weekend availability?<input></label><input type="hidden" value="SECRET"><script>PRIVATE_SCRIPT</script></form></body>`;
  const [o] = await jobs(
    { type: "jobposting", url: "https://studio.example/designer", html },
    "",
    { jobTitleKeywords: "Designer", locations: [{ city: "Lima" }] },
  );
  assert.equal(o.classification, "Requires Verification");
  assert(o.eligibilitySource?.includes("sponsorship"));
  assert(!o.eligibilitySource?.includes("PRIVATE_SCRIPT"));
  assert(!o.eligibilitySource?.includes("SECRET"));
  assert(
    o.missingInformation?.some((s) =>
      s.includes("Countries where you can legally work"),
    ),
  );
  assert(o.missingInformation?.some((s) => s.includes("Hours, weekends")));
  assert.equal(o.score, 0);
  assert(!o.verification.toLowerCase().includes("official"));
});

test("review priority orders pending leads without promoting them or outranking verified matches", () => {
  const base: any = {
    id: "x",
    kind: "job",
    name: "Designer",
    company: "Fixture",
    url: "https://studio.example/job",
    status: "New",
    score: 75,
    details: "",
    verification: "",
    checked: new Date().toISOString(),
    location: "Lima",
  };
  const good = classify(
    { ...base },
    {},
    "Design accessible buildings with a team.",
    true,
  );
  const weak = classify(
    { ...base, id: "weak", score: 30, url: "https://studio.example/weak" },
    {},
    "Design accessible buildings with a team.",
    false,
  );
  const filtered = classify(
    { ...base, id: "closed", url: "https://studio.example/closed" },
    {},
    "Design accessible buildings with a team.",
    true,
    true,
  );
  assert(good.reviewPriority! > weak.reviewPriority!);
  assert.equal(good.classification, "Requires Verification");
  assert.equal(good.score, 0);
  assert.equal(weak.score, 0);
  assert.equal(filtered.reviewPriority, 0);
  const verified: any = {
    ...base,
    id: "verified",
    classification: "Strong Match",
    score: 1,
    url: "https://studio.example/verified",
  };
  assert.deepEqual(
    [weak, filtered, good, verified]
      .sort(compareOpportunities)
      .map((o) => o.id),
    ["verified", "x", "weak", "closed"],
  );
  const db = new Store(":memory:");
  try {
    for (const o of [weak, filtered, good, verified]) db.put(o);
    assert.deepEqual(
      db.list().map((o) => o.id),
      ["verified", "x", "weak", "closed"],
    );
  } finally {
    db.db.close();
  }
});

test("closed cohort plus waitlist is filtered; a separate open intake does not become a false closed or verified result", async () => {
  const form =
    "<form>Company Startup Pitch<input><input><textarea></textarea></form>";
  const seed = {
    name: "Fictional accelerator",
    url: "https://fund.example/program",
  };
  const closed = await vc({
    ...seed,
    html:
      "<body>Accelerator Cohort #6 (Fall 2026) is closed. Join the waitlist for the next cohort." +
      form +
      "</body>",
  });
  assert.equal(closed.classification, "Filtered Out");
  assert.equal(closed.reviewPriority, 0);
  const reopened = await vc({
    ...seed,
    html:
      "<body>Fall cohort is closed. Applications are now open for the Spring cohort." +
      form +
      "</body>",
  });
  assert.equal(reopened.classification, "Requires Verification");
  assert(
    !reopened.disqualifications?.includes("Closed or expired application"),
  );
  assert(reopened.missingInformation?.some((s) => s.includes("intake")));
});

test("funding directory articles and login-only portals do not consume opportunity slots", async () => {
  const logs: string[] = [];
  const sources = await discoverSources(
    "vc",
    { productKeywords: "agriculture", discoveryQueryLimit: 1, limit: 4 },
    (s) => logs.push(s),
    async (url) => {
      if (url.includes("duckduckgo.com"))
        return '<a class="result__a" href="https://guide.example/accelerator">Program: How to Get In</a><a class="result__a" href="https://portal.example/login">Grant Portal</a><a class="result__a" href="https://guide.example/grants">Grants for Agriculture Startups in Peru</a><a class="result__a" href="https://fund.example/apply">Agriculture startup fund</a>';
      if (url.includes("guide.example"))
        return "<body>Directory content</body>";
      if (url.includes("portal.example"))
        return '<body>Partner grant login<form><input name="username"><input type="password"></form></body>';
      // Article metadata alone does not turn an official application into a directory.
      return '<head><meta property="og:type" content="article"></head><body>Agriculture startup fund application<form>Company Pitch<input><input><textarea></textarea></form></body>';
    },
  );
  assert.deepEqual(
    sources.map((s) => s.url),
    ["https://fund.example/apply"],
  );
  assert(logs.some((s) => s.includes("Directory/article skipped")));
  assert(logs.some((s) => s.includes("requires sign-in")));
});

test("a linked closed application overrides stale homepage marketing without inventing open intake", async () => {
  const previous = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: any) => {
    calls.push(String(input));
    return new Response(
      '<body>Currently taking applications for our next cohort!<a role="button">Enrollment Closed</a></body>',
    );
  };
  try {
    const seed = { name: "Fictional fund", url: "https://fund.example" };
    const html =
      '<body><nav><a href="https://forms.example/program">New Application Season</a></nav>Apply for our program!</body>';
    const o = await vc({ ...seed, html });
    assert.equal(o.classification, "Filtered Out");
    assert(o.disqualifications?.includes("Closed or expired application"));
    assert(
      o.evidence?.some(
        (e) =>
          e.url === "https://forms.example/program" &&
          e.quote === "Enrollment Closed",
      ),
    );
    assert(!o.eligibilitySource?.includes("Enrollment Closed")); // Keep attribution correct.
    assert.equal(o.reviewPriority, 0);
    assert.deepEqual(calls, ["https://forms.example/program"]);
    calls.length = 0;
    const multiple = await vc({
      ...seed,
      html: html.replace(
        "</body>",
        '<a href="https://forms.example/next">Apply for next cohort</a></body>',
      ),
    });
    assert.equal(multiple.classification, "Requires Verification");
    assert.equal(calls.length, 0); // A closed cohort cannot disqualify a different intake.
    globalThis.fetch = async () =>
      new Response(
        "<body><form>Company Pitch<input><input><textarea></textarea></form></body>",
      );
    const open = await vc({ ...seed, html });
    assert.equal(open.classification, "Requires Verification");
    assert(open.missingInformation?.some((s) => s.includes("intake")));
    globalThis.fetch = async () => new Response("Restricted", { status: 403 });
    const restricted = await vc({ ...seed, html });
    assert.equal(restricted.classification, "Requires Verification");
    assert(restricted.details.includes("could not be verified"));
  } finally {
    globalThis.fetch = previous;
  }
});
