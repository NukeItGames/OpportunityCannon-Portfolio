import { test } from "node:test";
import assert from "node:assert/strict";
import { search } from "../electron/search";
import { classify } from "../electron/ranking";
import { emptyProfiles, validateProfiles } from "../electron/profiles";
import { locationDecision } from "../electron/preferences";
import { readFileSync } from "node:fs";
const cases = [
  {
    id: "berlin",
    city: "Berlin",
    country: "Germany",
    title: "Nurse",
    skill: "patient care",
    industry: "healthcare",
    stage: "growth",
    employment: "Part-time",
    currency: "EUR",
    cash: 50000,
    equity: 10,
    threshold: { smallCheck: 40000, smallEquity: 12 },
    expected: "Golden Ticket",
  },
  {
    id: "montreal",
    city: "Montreal",
    country: "Canada",
    title: "Chef",
    skill: "pastry",
    industry: "food",
    stage: "seed",
    employment: "Contract",
    currency: "CAD",
    cash: 100000,
    equity: 20,
    threshold: { smallCheck: 200000, smallEquity: 5 },
    expected: "Strong Match",
  },
  {
    id: "kyoto",
    city: "Kyoto",
    country: "Japan",
    title: "Teacher",
    skill: "teaching",
    industry: "education",
    stage: "idea",
    employment: "Full-time",
    currency: "JPY",
    cash: 10000000,
    equity: 0,
    threshold: { minGrant: 5000000 },
    expected: "Golden Ticket",
  },
];
test("three fictional profiles use distinct sources, geographies, careers, stages and currencies without contamination", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  const text = (c: any) =>
    `${c.industry} ${c.stage} funding for companies in ${c.country}. Open startup application.`;
  globalThis.fetch = async (input: any) => {
    const u = String(input);
    requests.push(u);
    if (u.includes("api.lever.co"))
      return new Response(
        JSON.stringify(
          cases.map((c) => ({
            text: c.title,
            applyUrl: `https://${c.id}.example/job`,
            categories: {
              location: `${c.city}, ${c.country}`,
              commitment: c.employment,
            },
            descriptionPlain: `${c.skill} ${c.industry} role. Required professional skills.`,
            workplaceType: "onsite",
          })),
        ),
      );
    const c = cases.find((c) => u.includes(c.id))!;
    if (!c) throw Error("Unexpected URL " + u);
    return new Response(
      u.endsWith("/terms")
        ? `<body>Guaranteed ${c.cash} ${c.currency} for maximum ${c.equity}% total equity.</body>`
        : `<body>${text(c)}<form><label>Company<input></label><label>Startup<input></label><label>Pitch<textarea></textarea></label></form></body>`,
    );
  };
  try {
    for (const c of cases) {
      const p: any = emptyProfiles();
      p.job = {
        ...p.job,
        enabled: true,
        automaticDiscovery: false,
        locations: [{ city: c.city, country: c.country }],
        workModes: ["onsite"],
        jobTitleKeywords: c.title,
        skills: c.skill,
        industries: c.industry,
        employmentTypes: c.employment,
        boards: [{ type: "lever", board: `fictional-${c.id}` }],
        discoveryPolicy: JSON.stringify({
          reviews: {
            [`https://${c.id}.example/job`]: {
              checked: new Date().toISOString(),
              eligible: true,
              evidence: [
                {
                  url: `https://${c.id}.example/job`,
                  quote: `${c.skill} ${c.industry} role. Required professional skills.`,
                },
              ],
            },
          },
        }),
      };
      const fund = `https://${c.id}.example/apply`;
      const quote = `Guaranteed ${c.cash} ${c.currency} for maximum ${c.equity}% total equity.`;
      p.vc = {
        ...p.vc,
        enabled: true,
        automaticDiscovery: false,
        targetCountries: c.country,
        productKeywords: c.industry,
        stageKeywords: c.stage,
        fundingSources: [{ name: `Fictional ${c.id} fund`, url: fund }],
        discoveryPolicy: JSON.stringify({
          ...c.threshold,
          fundingCurrency: c.currency,
          reviews: {
            [fund]: {
              checked: new Date().toISOString(),
              eligible: true,
              evidence: [{ url: fund, quote: text(c) }],
              terms: {
                official: true,
                complete: true,
                currency: c.currency,
                guaranteedCash: c.cash,
                maxTotalEquity: c.equity,
                nonDilutive: c.equity === 0,
                sourceUrl: `https://${c.id}.example/terms`,
                quote,
              },
            },
          },
        }),
      };
      validateProfiles(p);
      const saved: any[] = [],
        logs: string[] = [];
      const before = requests.length;
      await search(
        "job",
        [],
        p.job,
        (s) => logs.push(s),
        (o) => saved.push(o),
      );
      await search(
        "vc",
        [{ name: "Ignored old catalog", url: "https://ignored.example" }],
        p.vc,
        (s) => logs.push(s),
        (o) => saved.push(o),
      );
      assert.deepEqual(
        saved
          .filter(
            (o) => o.kind === "job" && o.classification === "Strong Match",
          )
          .map((o) => o.name),
        [c.title],
      );
      assert.equal(
        saved.find((o) => o.kind === "vc").classification,
        c.expected,
      );
      assert(requests.slice(before).every((u) => u.includes(c.id)));
      assert(logs.some((l) => l.includes(c.city)));
      assert(logs.some((l) => l.includes(c.country)));
      assert.equal(JSON.stringify(p).includes("Unconfigured City"), false);
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("fresh installs have no sources, identity, locations or Golden Ticket defaults; old catalog is ignored", async () => {
  const p: any = emptyProfiles();
  assert.deepEqual(p.job.locations, []);
  assert.deepEqual(p.vc.fundingSources, []);
  assert(Object.values(p.shared).every((x) => x === ""));
  let calls = 0;
  const old = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw Error("Must not fetch");
  };
  const logs: string[] = [];
  try {
    await search(
      "vc",
      [{ name: "Legacy fund", url: "https://legacy.example" }],
      p.vc,
      (s) => logs.push(s),
      () => assert.fail(),
    );
    assert.equal(calls, 0);
    assert(logs.some((s) => s.includes("No reliable funding sources")));
  } finally {
    globalThis.fetch = old;
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert(!pkg.build.files.some((s: string) => s.includes("investors")));
});
test("complete locations, multiple targets and remote country restrictions are respected", () => {
  const p = {
    locations: [
      { city: "Berlin", country: "Germany" },
      { city: "Kyoto", country: "Japan" },
    ],
  };
  assert.equal(locationDecision("Berlin, Germany", p, "onsite"), "match");
  assert.equal(locationDecision("Berlin, USA", p, "onsite"), "unknown");
  assert.equal(locationDecision("Remote", p, "remote"), "unknown");
  assert.equal(locationDecision("Remote worldwide", p, "remote"), "match");
  assert.equal(locationDecision("Unconfigured City, Texas", p, "onsite"), "mismatch");
  assert.equal(
    locationDecision(
      "Montreal, Quebec, Canada",
      { targetLocation: "Montreal, Quebec, Canada" },
      "onsite",
    ),
    "match",
  );
});
test("no implicit Golden Ticket value and legacy profile fields preserved", () => {
  const url = "https://fixture.example/apply",
    text = "Healthcare growth investment with eligible applicant requirements.";
  const review = {
    checked: new Date().toISOString(),
    eligible: true,
    evidence: [{ url, quote: text }],
    terms: {
      liveVerified: true,
      complete: true,
      currency: "USD",
      guaranteedCash: 500000,
      maxTotalEquity: 5,
    },
  };
  const o: any = {
    kind: "vc",
    url,
    name: "Fictional",
    score: 70,
    checked: new Date().toISOString(),
  };
  const result = classify(
    o,
    {
      productKeywords: "healthcare",
      stageKeywords: "growth",
      discoveryPolicy: JSON.stringify({ reviews: { [url]: review } }),
    },
    text,
    true,
  );
  assert.equal(result.classification, "Strong Match");
  const p: any = emptyProfiles();
  delete p.job.locations;
  delete p.vc.fundingSources;
  p.job.targetLocation = "Montreal, Quebec, Canada";
  p.job.boards = [{ type: "jazzhr", board: "legacy" }];
  p.vc.discoveryPolicy = JSON.stringify({
    smallCheck: 12345,
    smallEquity: 2,
    fundingCurrency: "CAD",
  });
  assert.equal(validateProfiles(p).vc.discoveryPolicy, p.vc.discoveryPolicy);
  assert.equal(p.job.targetLocation, "Montreal, Quebec, Canada");
});
test("funding preferences use chosen currency and caps; unsupported sources never fall back", async () => {
  const url = "https://fictional.example/apply",
    text = "Healthcare growth companies in Germany can apply for funding.";
  const o: any = {
    kind: "vc",
    url,
    name: "Fictional",
    score: 50,
    checked: new Date().toISOString(),
  };
  const review = {
    checked: new Date().toISOString(),
    eligible: true,
    evidence: [{ url, quote: text }],
    terms: {
      liveVerified: true,
      complete: true,
      currency: "EUR",
      guaranteedCash: 50000,
      maxTotalEquity: 10,
    },
  };
  const p = {
    productKeywords: "healthcare",
    stageKeywords: "growth",
    targetCountries: "Germany",
  };
  const rank = (cfg: any) =>
    classify(
      { ...o },
      {
        ...p,
        discoveryPolicy: JSON.stringify({ ...cfg, reviews: { [url]: review } }),
      },
      text,
      true,
    );
  assert.equal(
    rank({ fundingCurrency: "EUR", minFunding: 60000 }).classification,
    "Filtered Out",
  );
  assert.equal(
    rank({ fundingCurrency: "EUR", maxFundingEquity: 5 }).classification,
    "Filtered Out",
  );
  assert.equal(
    rank({ fundingCurrency: "CAD", minFunding: 60000 }).classification,
    "Requires Verification",
  );
  const old = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw Error("No hidden fallback");
  };
  try {
    const log: string[] = [];
    await search(
      "job",
      [],
      {
        automaticDiscovery: false,
        boards: [{ type: "unsupported", board: "fictional" }],
        locations: [{ city: "Nairobi", country: "Kenya" }],
      },
      (s) => log.push(s),
      () => assert.fail(),
    );
    assert.equal(called, false);
    assert(log.some((s) => s.includes("Unsupported source")));
    assert(log.some((s) => s.includes("Nairobi")));
  } finally {
    globalThis.fetch = old;
  }
});
