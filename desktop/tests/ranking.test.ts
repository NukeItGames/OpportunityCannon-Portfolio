// Fictional test configuration; never used as application defaults.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, matches } from "../electron/ranking";
import { search, vc } from "../electron/search";
const url = "https://fund.example/apply";
const text =
  "Consumer pre-seed startup investment application accepts eligible founders.";
const base: any = {
  id: "v",
  kind: "vc",
  name: "Fund",
  company: "Fund",
  url,
  score: 60,
  status: "New",
  checked: new Date().toISOString(),
  verification: "",
  details: "",
};
function rank(overrides: any = {}, cfg: any = {}) {
  const review = {
    checked: new Date().toISOString(),
    eligible: true,
    evidence: [{ url, quote: text }],
    ...overrides,
  };
  return classify(
    { ...base },
    {
      productKeywords: "consumer",
      stageKeywords: "pre-seed",
      discoveryPolicy: JSON.stringify({
        fundingCurrency: "USD",
        smallCheck: 250000,
        smallEquity: 5,
        largeCheck: 500000,
        largeEquity: 7,
        minGrant: 50000,
        ...cfg,
        reviews: { [url]: review },
      }),
    },
    text,
    true,
  );
}
test("boundary matching does not match AI in retail or engineer in engineering", () => {
  assert(!matches("Retail associate", "AI"));
  assert(matches("AI Engineer", "AI"));
});
test("fresh reviewed fit is strong, unknown terms never golden", () =>
  assert.equal(rank().classification, "Strong Match"));
test("stale, future, absent eligibility, expired and excluded evidence fails closed", () => {
  for (const r of [
    { checked: "2020-01-01" },
    { checked: "2099-01-01" },
    { eligible: false },
    { evidence: [] },
    { deadline: "2020-01-01" },
  ])
    assert.equal(
      rank(r).classification,
      r.eligible === false || r.deadline
        ? "Filtered Out"
        : "Requires Verification",
    );
  assert.equal(
    rank({}, { excludedOpportunities: "Fund" }).classification,
    "Filtered Out",
  );
});
test("verified full terms boundaries, conditional and unknown terms", () => {
  const terms = {
    liveVerified: true,
    complete: true,
    currency: "USD",
    guaranteedCash: 250000,
    maxTotalEquity: 5,
  };
  assert.equal(rank({ terms }).classification, "Golden Ticket");
  for (const t of [
    { maxTotalEquity: 5.01 },
    { guaranteedCash: 249999 },
    { liveVerified: false },
    { complete: false },
    { currency: "EUR" },
    { guaranteedCash: 1000000, maxTotalEquity: 10 },
  ])
    assert.equal(
      rank({ terms: { ...terms, ...t } }).classification,
      "Strong Match",
    );
  assert.equal(
    rank({ terms: { ...terms, guaranteedCash: 500000, maxTotalEquity: 7 } })
      .classification,
    "Golden Ticket",
  );
  assert.equal(
    rank({
      terms: {
        ...terms,
        guaranteedCash: 50000,
        nonDilutive: true,
        maxTotalEquity: 0,
      },
    }).classification,
    "Golden Ticket",
  );
});
test("job title, location, skills and unrealistic experience reject", () => {
  const o: any = {
    ...base,
    kind: "job",
    name: "Senior Software Engineer",
    location: "Toronto",
  };
  const r = classify(
    o,
    {
      targetLocation: "Toronto",
      jobTitleKeywords: "software",
      skills: "TypeScript",
      discoveryPolicy: JSON.stringify({ maxRequiredYears: 2 }),
    },
    "TypeScript with minimum 8 years of experience",
    true,
  );
  assert.equal(r.classification, "Filtered Out");
  assert(r.reasons?.some((x) => x.includes("Experience")));
});
test("newsletter is not VC intake, duplicates saved only once", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      '<body>Consumer pre-seed newsletter<form><input type="email"></form></body>',
    );
  try {
    assert(
      (
        await vc(
          { name: "Fund", url },
          { productKeywords: "consumer", stageKeywords: "pre-seed" },
        )
      ).reasons?.some((x) => x.includes("intake")),
    );
    const saved: any[] = [];
    await search(
      "vc",
      [
        { name: "Fund", url },
        { name: "Fund", url: url + "?utm_source=x" },
      ],
      {
        limit: 2,
        fundingSources: [
          { name: "Fund", url },
          { name: "Fund", url: url + "?utm_source=x" },
        ],
      },
      () => {},
      (o) => saved.push(o),
    );
    assert.equal(saved.length, 1);
  } finally {
    globalThis.fetch = old;
  }
});
