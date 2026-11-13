// Fictional test configuration; never used as application defaults.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../electron/ranking";
import { profileSnapshot } from "../electron/eligibility";
import {
  emptyProfiles,
  validateProfiles,
  packetFields,
} from "../electron/profiles";
const text =
  "TypeScript software developer required in Toronto. Must be able to independently debug software.";
const url = "https://employer.example/job";
const opportunity: any = {
  id: "j",
  kind: "job",
  name: "Software developer",
  company: "Fixture",
  url,
  score: 70,
  status: "New",
  checked: new Date().toISOString(),
  verification: "Active ATS",
  details: text,
  location: "Toronto",
};
const facts: any = {
  targetLocation: "Toronto",
  jobTitleKeywords: "software",
  skills: "TypeScript",
  workHistory: "Fixture history",
  independentSkills: "Fixture debugging",
};
function profile(decision: any = true) {
  const snapshot = profileSnapshot(facts, "job");
  return {
    ...facts,
    discoveryPolicy: JSON.stringify({
      confirmedProfile: snapshot,
      reviews: {
        [url]: {
          eligible: decision,
          checked: new Date().toISOString(),
          profileSnapshot: snapshot,
          sourceSnapshot: text,
          rationale: "Fixture candidate satisfies every mandatory condition.",
          evidence: [{ url, quote: text }],
        },
      },
    }),
  };
}
test("missing decision is not an actual disqualification; explicit denial is", () => {
  const missing = classify({ ...opportunity }, facts, text, true);
  assert.equal(missing.eligibilityState, "Missing information");
  assert.deepEqual(missing.disqualifications, []);
  const denied = classify({ ...opportunity }, profile(false), text, true);
  assert.equal(denied.eligibilityState, "Disqualified");
  assert(!denied.missingInformation?.some((s) => s.includes("decision")));
});
test("confirmed source/profile match can qualify; changes revoke it", () => {
  assert.equal(
    classify({ ...opportunity }, profile(), text, true).classification,
    "Strong Match",
  );
  const changed = classify(
    { ...opportunity },
    { ...profile(), skills: "Python" },
    text,
    true,
  );
  assert.equal(changed.classification, "Requires Verification");
  assert(
    changed.missingInformation?.some((s) => s.includes("profile changed")),
  );
  const changedSource = classify(
    { ...opportunity },
    profile(),
    text + " New mandatory certification.",
    true,
  );
  assert.equal(changedSource.classification, "Requires Verification");
  assert(
    changedSource.missingInformation?.some((s) =>
      s.includes("requirements changed"),
    ),
  );
  assert.equal(
    classify({ ...opportunity }, profile(), text, false).classification,
    "Requires Verification",
  );
});
test("eligibility facts persist and never leak into autofill packets", () => {
  const p: any = emptyProfiles();
  p.job = { ...p.job, ...profile(), enabled: true };
  validateProfiles(p);
  assert.equal(p.job.independentSkills, "Fixture debugging");
  const fields = packetFields(p, "job", url);
  assert.equal(fields.discoveryPolicy, undefined);
  assert.equal(fields.independentSkills, undefined);
  assert.equal(fields.skills, "TypeScript");
});
test("confirmed funding profile still requires live terms and cannot bypass intake", () => {
  const body =
    "Consumer pre-seed funding. Eligible founders can apply using the startup application.";
  const o: any = { ...opportunity, kind: "vc", name: "Fixture Fund" };
  const facts: any = {
    productKeywords: "consumer",
    stageKeywords: "pre-seed",
    legalStructure: "Fixture corporation",
  };
  const snapshot = profileSnapshot(facts, "vc");
  const review = {
    eligible: true,
    checked: new Date().toISOString(),
    profileSnapshot: snapshot,
    sourceSnapshot: body,
    evidence: [{ url, quote: body }],
    terms: {
      liveVerified: true,
      complete: true,
      currency: "USD",
      guaranteedCash: 500000,
      maxTotalEquity: 7,
    },
  };
  const p = {
    ...facts,
    discoveryPolicy: JSON.stringify({
      confirmedProfile: snapshot,
      fundingCurrency: "USD",
      largeCheck: 500000,
      largeEquity: 7,
      reviews: { [url]: review },
    }),
  };
  assert.equal(
    classify({ ...o }, p, body, true).classification,
    "Golden Ticket",
  );
  assert.equal(
    classify({ ...o }, p, body, false).classification,
    "Requires Verification",
  );
  review.terms.liveVerified = false;
  assert.equal(
    classify(
      { ...o },
      {
        ...p,
        discoveryPolicy: JSON.stringify({
          confirmedProfile: snapshot,
          reviews: { [url]: review },
        }),
      },
      body,
      true,
    ).classification,
    "Strong Match",
  );
});
test("AI-assisted projects do not certify independent skill, SQL or professional years", async () => {
  const { eligibilityQuestions } = await import("../electron/eligibility");
  const q = eligibilityQuestions(
    {
      skills: "TypeScript, React Native, Expo, Supabase",
      workHistory: "AI-assisted project development",
      preferences: "Planning Toronto relocation; weekends unconfirmed",
    },
    "job",
    "Programming and SQL; 3 years experience; office work and weekends required",
  );
  for (const field of [
    "independentSkills",
    "relevantExperienceYears",
    "onsiteAvailability",
    "scheduleAvailability",
  ])
    assert.equal(q.find((x) => x.field === field)?.known, false);
  const pending = classify(
    { ...opportunity, location: "" },
    { ...facts, relevantExperienceYears: "" },
    text,
    true,
  );
  assert.equal(pending.classification, "Requires Verification");
  assert.deepEqual(pending.disqualifications, []);
  assert.equal(pending.score, 0);
});
test("unconfirmed incorporation and goals are not verified legal status or round amount", async () => {
  const { eligibilityQuestions } = await import("../electron/eligibility");
  const q = eligibilityQuestions(
    {
      legalStructure: "Unconfirmed",
      fundingGoals: "Seeking funding to go full-time",
      monthlyRevenue: "USD 0 MRR",
      companyStage: "Pre-launch, pre-revenue",
    },
    "vc",
    "US incorporated startups raising a funding round with revenue",
  );
  assert.equal(q.find((x) => x.field === "incorporationCountry")?.known, false);
  assert.equal(q.find((x) => x.field === "fundraiseAmount")?.known, false);
  assert.equal(q.find((x) => x.field === "monthlyRevenue")?.known, true);
});
