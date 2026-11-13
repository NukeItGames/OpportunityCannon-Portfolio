import { search } from "../electron/search";
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { opportunityIdentity } from "../electron/core";
// Fictional preferences, genuine public network discovery. No candidate URLs or employer names are supplied.
const profiles = [
  {
    name: "Berlin",
    job: {
      locations: [{ city: "Berlin", country: "Germany" }],
      jobTitleKeywords: "Pflegefachkraft",
      industries: "healthcare",
      skills: "Pflege",
    },
    vc: {
      targetCountries: "Germany",
      targetRegion: "Berlin",
      productKeywords: "healthcare",
      stageKeywords: "seed",
    },
  },
  {
    name: "Toronto",
    job: {
      locations: [{ city: "Toronto", country: "Canada" }],
      jobTitleKeywords: "accountant",
      industries: "finance",
      skills: "accounting",
    },
    vc: {
      targetCountries: "Canada",
      targetRegion: "Toronto",
      productKeywords: "cleantech",
      stageKeywords: "seed",
    },
  },
  {
    name: "Singapore",
    job: {
      locations: [{ city: "Singapore", country: "Singapore" }],
      jobTitleKeywords: "data analyst",
      industries: "analytics",
      skills: "SQL",
    },
    vc: {
      targetCountries: "Singapore",
      productKeywords: "biotech",
      stageKeywords: "early stage",
    },
  },
];
async function main() {
  const all: any[] = [];
  for (const p of profiles) {
    for (const kind of ["job", "vc"] as const) {
      const logs: string[] = [],
        results: any[] = [];
      const settings = {
        ...p[kind],
        automaticDiscovery: true,
        discoveryQueryLimit: 2,
        limit: 4,
        boards: [],
        fundingSources: [],
      };
      await search(
        kind,
        [],
        settings,
        (s) => {
          logs.push(s);
          console.log(`${p.name}/${kind}: ${s}`);
        },
        (o) => results.push(o),
      );
      // No invented qualification reviews for fictional people/companies.
      assert(
        results.every(
          (o) =>
            o.discovery &&
            !["Strong Match", "Golden Ticket"].includes(o.classification),
        ),
      );
      assert.equal(
        new Set(results.map((o) => opportunityIdentity(o.kind, o.url))).size,
        results.length,
      );
      assert(
        logs.some((s) =>
          s.includes(
            kind === "job" ? p.job.jobTitleKeywords : p.vc.productKeywords,
          ),
        ),
      );
      assert.equal(settings.boards.length + settings.fundingSources.length, 0);
      all.push({ profile: p.name, kind, settings, logs, results });
      mkdirSync("test-results", { recursive: true });
      writeFileSync(
        "test-results/automatic-live.json",
        JSON.stringify(
          { checked: new Date().toISOString(), runs: all },
          null,
          2,
        ),
      );
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
