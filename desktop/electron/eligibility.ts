export const eligibilityFields: Record<string, Record<string, string>> = {
  job: {
    relevantExperienceYears: "Years of relevant professional experience",
    workAuthorization:
      "Countries where you can legally work; sponsorship needed",
    onsiteAvailability: "Onsite / hybrid availability and commute locations",
    relocation: "Relocation availability and timing",
    scheduleAvailability: "Hours, weekends and start date",
    independentSkills: "Skills and tools you can independently demonstrate",
    credentials: "Required degrees, licenses or certifications you hold",
  },
  vc: {
    incorporationCountry: "Country of incorporation (or not incorporated)",
    companyStage: "Current company stage",
    monthlyRevenue:
      "Current monthly revenue and currency (zero is a valid answer)",
    customerEvidence: "Users, customers, pilots or other traction evidence",
    founderCommitment: "Founder full-time availability and timing",
    teamComposition: "Founders, roles and technical building capability",
    programRelocation: "Accelerator relocation and attendance availability",
    fundraiseAmount: "Amount and currency currently raising",
    ownershipEligibility: "Ownership or residency facts relevant to grants",
    eligibilityConstraints: "Other eligibility constraints or restrictions",
  },
};
export const reusedFields: Record<string, string[]> = {
  job: [
    "locations",
    "workModes",
    "industries",
    "employmentTypes",
    "experienceLevels",
    "targetLocation",
    "jobTitleKeywords",
    "skills",
    "workHistory",
    "education",
    "salaryExpectations",
    "preferences",
    "resumeText",
  ],
  vc: [
    "productKeywords",
    "stageKeywords",
    "targetCountries",
    "targetRegion",
    "founderBackground",
    "company",
    "description",
    "progress",
    "traction",
    "businessModel",
    "fundingGoals",
    "legalStructure",
  ],
};
export function profileSnapshot(p: any, mode: string) {
  return JSON.stringify(
    Object.fromEntries(
      [...reusedFields[mode], ...Object.keys(eligibilityFields[mode])]
        .sort()
        .map((k) => [k, p[k] || ""]),
    ),
  );
}
export const numericPolicy: Record<string, [string, number | string]> = {
  maxEvidenceDays: ["Evidence freshness (days)", 7],
  maxRequiredYears: ["Maximum required experience (years)", 0],
  sourceOffset: ["Skip first sources", 0],
  minFunding: ["Minimum funding sought (selected currency)", "No minimum"],
  maxFundingEquity: ["Maximum acceptable total equity (%)", "No maximum"],
  minGrant: ["Minimum non-dilutive grant (selected currency)", "Disabled"],
  smallCheck: ["First investment threshold (selected currency)", "Disabled"],
  smallEquity: ["Maximum total equity for first threshold (%)", "Disabled"],
  largeCheck: ["Second investment threshold (selected currency)", "Disabled"],
  largeEquity: ["Maximum total equity for second threshold (%)", "Disabled"],
  millionCheck: [
    "Founder-friendly investment threshold (selected currency)",
    "Disabled",
  ],
};
// These are review prompts, not an automatic determination that a phrase is mandatory.
export function eligibilityQuestions(p: any, mode: string, text: string) {
  const rules: [string, RegExp, string[]][] =
    mode === "job"
      ? [
          [
            "independentSkills",
            /skills?|qualifications|proficien|ability|programming|debug/i,
            [],
          ],
          ["relevantExperienceYears", /\byears?\b.{0,45}\bexperience\b/i, []],
          [
            "workAuthorization",
            /sponsor|authori[sz].{0,20}work|right to work/i,
            [],
          ],
          ["onsiteAvailability", /on.?site|in.person|office|based in/i, []],
          ["scheduleAvailability", /weekend|shift|full.time|start date/i, []],
          [
            "credentials",
            /degree|bachelor|certification|license/i,
            ["education"],
          ],
        ]
      : [
          [
            "incorporationCountry",
            /incorporat|legal entity|jurisdiction|country|registered/i,
            ["legalStructure"],
          ],
          [
            "companyStage",
            /pre.seed|seed.stage|idea.stage|pre.revenue/i,
            ["stageKeywords", "progress"],
          ],
          ["monthlyRevenue", /revenue|MRR|ARR/i, []],
          [
            "customerEvidence",
            /traction|customers|users|product.market.fit/i,
            ["traction"],
          ],
          ["founderCommitment", /full.time|commitment/i, []],
          [
            "teamComposition",
            /cofounder|co-founder|technical founder|team/i,
            [],
          ],
          ["programRelocation", /relocat|residen|in.person/i, []],
          ["fundraiseAmount", /raising|fundrais|round size/i, []],
        ];
  return rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([field, , fallback]) => ({
      field,
      label: eligibilityFields[mode][field],
      known: [p[field], ...fallback.map((k) => p[k])].some(
        (value) =>
          typeof value === "string" &&
          value.trim().length > 0 &&
          !/unconfirmed|unverified|unknown|not yet verified|needs? confirmation/i.test(
            value,
          ),
      ),
    }));
}

export function displayFact(value: any): string {
  if (Array.isArray(value))
    return (
      value
        .map((v) =>
          typeof v === "string"
            ? v
            : Object.values(v || {})
                .filter(Boolean)
                .join(", "),
        )
        .filter(Boolean)
        .join("; ") || "Not provided"
    );
  return typeof value === "string" && value ? value : "Not provided";
}
