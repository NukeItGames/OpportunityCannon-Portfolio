import { test } from "node:test";
import assert from "node:assert/strict";
import {
  discoveryQueries,
  parseSearch,
  atsSource,
  discoverSources,
} from "../electron/discovery";
import { request, publicAddress } from "../electron/http";
import { search, jobs } from "../electron/search";
import { classify } from "../electron/ranking";
import { canonical, opportunityIdentity, Store, key } from "../electron/core";
import { emptyProfiles } from "../electron/profiles";

const listing = (url: string, title: string, snippet = "") =>
  `<div class="result"><a class="result__a" href="${url}">${title}</a><span class="result__snippet">${snippet}</span></div>`;
const discovery = {
  provider: "fixture",
  query: "fixture",
  resultUrl: "https://example.test",
  checked: new Date().toISOString(),
  method: "search",
};

test("automatic queries are profile-specific, private facts never leave, and blank profiles have no fallback", () => {
  assert.equal(emptyProfiles().job.automaticDiscovery, true);
  assert.equal(emptyProfiles().vc.automaticDiscovery, true);
  assert.deepEqual(discoveryQueries("job", {}), []);
  assert.deepEqual(discoveryQueries("vc", {}), []);
  const jobs = discoveryQueries("job", {
    locations: [
      { city: "Lima", country: "Peru" },
      { city: "Oslo", country: "Norway" },
    ],
    jobTitleKeywords: "architect",
    industries: "construction",
    discoveryQueryLimit: 2,
    email: "PRIVATE",
    workHistory: "PRIVATE",
    resumeText: "PRIVATE",
    independentSkills: "PRIVATE",
  });
  assert.equal(jobs.length, 2);
  assert.match(jobs[0], /architect Lima Peru construction/);
  assert.match(jobs[1], /architect Oslo Norway construction/);
  const funds = discoveryQueries("vc", {
    productKeywords: "agriculture",
    stageKeywords: "growth",
    targetRegion: "Nairobi",
    targetCountries: "Kenya",
    companyName: "PRIVATE",
    traction: "PRIVATE",
  });
  assert.match(funds[0], /agriculture growth Nairobi Kenya/);
  assert(![...jobs, ...funds].join().includes("PRIVATE"));
  const countries = discoveryQueries("vc", {
    productKeywords: "agriculture",
    targetCountries: "Kenya,Norway",
    discoveryQueryLimit: 2,
  });
  assert(countries[0].includes("Kenya") && !countries[0].includes("Norway"));
  assert(countries[1].includes("Norway") && !countries[1].includes("Kenya"));
  assert(
    discoveryQueries("job", {
      jobTitleKeywords: "architect",
      locations: [{ city: "Lima" }],
      workModes: ["remote"],
    })[0].includes("remote"),
  );
});

test("search parsing preserves provenance, rejects unsafe URLs and detects challenges", () => {
  const rows = parseSearch(
    listing(
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fjobs.eu.lever.co%2Ffixture%2F123",
      "Architect",
      "Lima",
    ) + listing("https://127.0.0.1/private", "unsafe"),
    "architect Lima",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].snippet, "Lima");
  assert.equal(rows[0].discovery?.query, "architect Lima");
  assert.equal(atsSource(rows[0].url!)?.region, "eu");
  assert.throws(
    () => parseSearch("<form class='anomaly-modal'>challenge</form>", "x"),
    /human verification/,
  );
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "invalid",
  ])
    assert.equal(publicAddress(address), false, address);
  assert(publicAddress("8.8.8.8"));
  assert(publicAddress("2606:4700:4700::1111"));
  assert.throws(() => canonical("https://host.internal/path"));
});

test("automatic crawling favors relevant career pages, follows ATS links and deduplicates boards", async () => {
  const requested: string[] = [],
    logs: string[] = [];
  const sources = await discoverSources(
    "job",
    {
      jobTitleKeywords: "architect",
      locations: [{ city: "Lima" }],
      limit: 2,
      discoveryQueryLimit: 1,
    },
    (s) => logs.push(s),
    async (url) => {
      requested.push(url);
      if (url.includes("duckduckgo.com"))
        return (
          listing("https://jobs.lever.co/unrelated/1", "Unrelated") +
          listing("https://studio.example/careers", "Architect Lima") +
          listing("https://jobs.eu.lever.co/studio/2", "Architect Lima") +
          listing("https://jobs.eu.lever.co/studio/3", "Architect Lima")
        );
      if (url === "https://studio.example/careers")
        return '<a href="https://jobs.lever.co/studio/1">Open jobs</a>';
      throw Error("Unexpected URL " + url);
    },
  );
  assert.equal(sources.length, 2);
  assert(sources.every((s) => s.board === "studio"));
  assert.notEqual(sources[0].region, sources[1].region);
  assert(requested.includes("https://studio.example/careers"));
  assert(sources.every((s) => s.discovery));
});

test("funding directories are leads; official application links are fetched instead of FAQ links", async () => {
  const seen: string[] = [];
  const sources = await discoverSources(
    "vc",
    {
      productKeywords: "agriculture",
      targetCountries: "Kenya",
      limit: 1,
      discoveryQueryLimit: 1,
    },
    () => {},
    async (url) => {
      seen.push(url);
      if (url.includes("duckduckgo.com"))
        return listing(
          "https://directory.example/list",
          "Top agriculture accelerators",
        );
      if (url === "https://directory.example/list")
        return '<a href="https://fund.example">Official website</a>';
      if (url === "https://fund.example")
        return '<a href="/application/faq">FAQ</a><a href="/apply">Apply</a>';
      if (url === "https://fund.example/apply")
        return "<body>Current application</body>";
      throw Error("Unexpected URL " + url);
    },
  );
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://fund.example/apply");
  assert(!seen.some((s) => s.endsWith("faq")));
  assert(sources[0].html?.includes("Current application"));
});

test("coverage errors stop challenges, report unsupported pages, and do not substitute a default source", async () => {
  const logs: string[] = [];
  let calls = 0;
  const sources = await discoverSources(
    "job",
    { jobTitleKeywords: "architect" },
    (s) => logs.push(s),
    async () => {
      calls++;
      return "anomaly-modal";
    },
  );
  assert.deepEqual(sources, []);
  assert.equal(calls, 1);
  assert(logs.some((s) => s.includes("without bypassing")));
  logs.length = 0;
  const unsupported = await discoverSources(
    "job",
    { jobTitleKeywords: "architect", discoveryQueryLimit: 1 },
    (s) => logs.push(s),
    async (url) =>
      url.includes("duckduckgo.com")
        ? listing("https://dynamic.example/jobs", "Architect")
        : "<body>Enable JavaScript</body>",
  );
  assert.deepEqual(unsupported, []);
  assert(logs.some((s) => s.includes("Unsupported career page")));
});

test("redirects preserve server-required slashes and reject private destinations", async () => {
  const previous = globalThis.fetch,
    seen: string[] = [];
  globalThis.fetch = async (input: any) => {
    seen.push(String(input));
    return String(input).endsWith("/apply/")
      ? new Response("ok")
      : new Response(null, { status: 301, headers: { location: "/apply/" } });
  };
  try {
    assert.equal(await request("https://example.test/apply"), "ok");
    assert.deepEqual(seen, [
      "https://example.test/apply",
      "https://example.test/apply/",
    ]);
    globalThis.fetch = async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private" },
      });
    await assert.rejects(request("https://example.test"), /Public URLs/);
  } finally {
    globalThis.fetch = previous;
  }
});

test("no-manual-source search screens real adapter rows, duplicates, expired and irrelevant listings", async () => {
  const previous = globalThis.fetch;
  const page = "https://employer.example/expired";
  globalThis.fetch = async (input: any) => {
    const url = String(input);
    if (url.includes("duckduckgo.com"))
      return new Response(
        listing("https://jobs.lever.co/fixture/1", "Architect Lima") +
          listing("https://jobs.lever.co/fixture/2", "Architect Lima") +
          listing(page, "Architect Lima"),
      );
    if (url.includes("api.lever.co"))
      return new Response(
        JSON.stringify([
          {
            text: "Architect",
            applyUrl: "https://jobs.lever.co/fixture/1/apply",
            categories: { location: "Lima, Peru" },
            descriptionPlain: "Architecture and design professional required.",
          },
          {
            text: "Architect",
            applyUrl: "https://jobs.lever.co/fixture/1",
            categories: { location: "Lima, Peru" },
            descriptionPlain: "Architecture and design professional required.",
          },
          {
            text: "Accountant",
            applyUrl: "https://jobs.lever.co/fixture/3",
            categories: { location: "Lima, Peru" },
            descriptionPlain: "Finance",
          },
        ]),
      );
    if (url === page)
      return new Response(
        `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Architect", description: "Expired architecture role", validThrough: "2000-01-01", jobLocation: { address: { addressLocality: "Lima", addressCountry: "Peru" } } })}</script><form><input></form>`,
      );
    throw Error("Unexpected URL " + url);
  };
  try {
    const saved: any[] = [],
      logs: string[] = [];
    await search(
      "job",
      [],
      {
        jobTitleKeywords: "Architect",
        locations: [{ city: "Lima", country: "Peru" }],
        automaticDiscovery: true,
        discoveryQueryLimit: 1,
        limit: 3,
        boards: [],
      },
      (s) => logs.push(s),
      (o) => saved.push(o),
    );
    assert.equal(saved.length, 3);
    assert.equal(
      saved.filter((s) => s.classification === "Requires Verification").length,
      1,
    );
    assert.equal(
      saved.filter((s) => s.classification === "Filtered Out").length,
      2,
    );
    assert(
      saved.every(
        (s) =>
          s.discovery &&
          s.classification !== "Golden Ticket" &&
          s.classification !== "Strong Match",
      ),
    );
    assert(logs.some((s) => s.includes("Duplicate filtered")));
    assert(
      saved.some((s) =>
        s.disqualifications.includes("Closed or expired application"),
      ),
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("discovered sources require fresh official-identity confirmation as well as eligibility before promotion", () => {
  const url = "https://fund.example/apply",
    text = "Agriculture seed funding accepts companies in Kenya.";
  const o: any = {
    id: "x",
    kind: "vc",
    name: "Fixture",
    url,
    company: "Fixture",
    details: "",
    status: "New",
    checked: new Date().toISOString(),
    score: 50,
    discovery,
  };
  const review = {
    checked: new Date().toISOString(),
    eligible: true,
    evidence: [{ url, quote: text }],
  };
  const rank = (extra: any) =>
    classify(
      { ...o },
      {
        productKeywords: "agriculture",
        stageKeywords: "seed",
        targetCountries: "Kenya",
        discoveryPolicy: JSON.stringify({
          reviews: { [url]: { ...review, ...extra } },
        }),
      },
      text,
      true,
    );
  assert.equal(rank({}).classification, "Requires Verification");
  assert.equal(rank({ officialSource: true }).classification, "Strong Match");
  assert.equal(
    rank({ officialSource: true, checked: "2000-01-01" }).classification,
    "Requires Verification",
  );
  assert.equal(
    rank({ officialSource: true, eligible: false }).classification,
    "Filtered Out",
  );
});

test("ATS URL aliases preserve existing applied record identity and history across runs", () => {
  const store = new Store(":memory:"),
    url = "https://jobs.lever.co/fixture/1";
  try {
    assert.equal(
      opportunityIdentity("job", url),
      opportunityIdentity("job", url + "/apply"),
    );
    const o: any = {
      id: key(url),
      kind: "job",
      url,
      name: "Fixture",
      company: "Fixture",
      details: "",
      verification: "",
      checked: new Date().toISOString(),
      status: "New",
      score: 0,
    };
    store.put(o);
    store.status(o.id, "Applied");
    store.put({ ...o, id: key(url + "/apply"), url: url + "/apply" });
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].id, o.id);
    assert.equal(store.list()[0].status, "Applied");
  } finally {
    store.db.close();
  }
});

test("JobPosting newsletter fields never prove application intake and excluded ATS aliases remain excluded", async () => {
  const url = "https://employer.example/job",
    text = "Architecture role with current design requirements.";
  const profile = {
    discoveryPolicy: JSON.stringify({
      reviews: {
        [url]: {
          checked: new Date().toISOString(),
          officialSource: true,
          eligible: true,
          evidence: [{ url, quote: text }],
        },
      },
    }),
  };
  const html = `<body><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Architect", description: text, hiringOrganization: { name: "Fictional Studio" } })}</script><form>Newsletter<input name="name"><input name="email"><input name="city"></form></body>`;
  const [o] = await jobs(
    { type: "jobposting", url, html, discovery },
    "",
    profile,
  );
  assert.equal(o.company, "Fictional Studio");
  assert.equal(o.classification, "Requires Verification");
  assert(o.reasons?.some((s) => s.includes("intake")));
  const blocked = classify(
    { ...o, url: "https://jobs.lever.co/fixture/1/apply" },
    {
      discoveryPolicy: JSON.stringify({
        excludedOpportunities: "https://jobs.lever.co/fixture/1",
      }),
    },
    text,
    true,
  );
  assert.equal(blocked.classification, "Filtered Out");
  assert(
    blocked.disqualifications?.includes(
      "Excluded / previously applied or rejected",
    ),
  );
});
