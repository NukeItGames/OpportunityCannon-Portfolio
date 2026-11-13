import { locationDecision, workMode, includesTerm } from "./preferences";
import { profileSnapshot, eligibilityQuestions } from "./eligibility";
import { canonical, opportunityIdentity, type Opportunity } from "./core";
export const split = (s = "") =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
export function matches(text: string, preference = "") {
  return split(preference).some((x) =>
    new RegExp(
      `(^|[^a-z0-9])${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`,
      "i",
    ).test(text),
  );
}
export function policy(p: any) {
  const cfg = p.discoveryPolicy ? JSON.parse(p.discoveryPolicy) : {};
  for (const k of [
    "minFunding",
    "maxFundingEquity",
    "maxEvidenceDays",
    "maxRequiredYears",
    "minGrant",
    "smallCheck",
    "smallEquity",
    "largeCheck",
    "largeEquity",
    "millionCheck",
  ]) {
    if (cfg[k] !== undefined && (!Number.isFinite(cfg[k]) || cfg[k] < 0))
      throw Error(`Invalid discovery threshold: ${k}`);
  }
  return cfg;
}
// Reviews are explicit, source-backed assessments, never inferred from keyword counts.
export function classify(
  o: Opportunity,
  p: any,
  text: string,
  intake: boolean,
  closed = false,
): Opportunity {
  const cfg = policy(p),
    reasons: string[] = [];
  const review = cfg.reviews?.[canonical(o.url)];
  const age = review ? Date.now() - Date.parse(review.checked) : NaN;
  const fresh =
    Number.isFinite(age) &&
    age >= 0 &&
    age <= (cfg.maxEvidenceDays ?? 7) * 86400000;
  const evidence = (review?.evidence || []).filter((e: any) => {
    try {
      return (
        canonical(e.url) === canonical(o.url) &&
        typeof e.quote === "string" &&
        e.quote.length >= 20 &&
        text.includes(e.quote)
      );
    } catch {
      return false;
    }
  });
  const snapshotCurrent =
    !review?.profileSnapshot ||
    (review.profileSnapshot === profileSnapshot(p, o.kind) &&
      cfg.confirmedProfile === review.profileSnapshot);
  const sourceCurrent =
    !review?.sourceSnapshot || review.sourceSnapshot === text.slice(0, 60000);
  const verified =
    fresh && evidence.length > 0 && snapshotCurrent && sourceCurrent;
  o.eligibilitySource = text.slice(0, 60000);
  const excluded = split(cfg.excludedOpportunities).some(
    (x: string) =>
      x.toLowerCase() === o.name.toLowerCase() ||
      (x.startsWith("https://") &&
        (() => {
          try {
            return (
              opportunityIdentity(o.kind, x) ===
              opportunityIdentity(o.kind, o.url)
            );
          } catch {
            return false;
          }
        })()),
  );
  if (
    review?.deadline &&
    (!Number.isFinite(Date.parse(review.deadline)) ||
      Date.parse(review.deadline) < Date.now())
  )
    closed = true;
  if (closed) reasons.push("Closed or expired application");
  if (excluded) reasons.push("Excluded / previously applied or rejected");
  if (!intake)
    reasons.push(
      "Active application intake not verified; a link or newsletter is insufficient",
    );
  if (o.kind === "job") {
    const mode = workMode([o.mode, o.location].filter(Boolean).join(" "));
    const location = locationDecision(o.location || "", p, mode);
    if (location === "unknown")
      reasons.push(
        "Missing information: employer location or remote country eligibility unverified",
      );
    if (location === "mismatch") reasons.push("Location mismatch");
    if (p.workModes?.length && !mode) reasons.push("Work mode unverified");
    else if (p.workModes?.length && !p.workModes.includes(mode))
      reasons.push("Excluded work mode");
    if (p.employmentTypes && !o.employmentType)
      reasons.push("Employment type unverified");
    else if (
      p.employmentTypes &&
      !includesTerm(o.employmentType || "", p.employmentTypes)
    )
      reasons.push("Excluded employment type");
    if (p.industries && !matches(text, p.industries))
      reasons.push("Industry fit unverified");
    if (p.experienceLevels && !matches(o.name + " " + text, p.experienceLevels))
      reasons.push("Experience level unverified");
    if (p.jobTitleKeywords && !matches(o.name, p.jobTitleKeywords))
      reasons.push("Career title mismatch");
    if (p.skills && !matches(text, p.skills))
      reasons.push("No verified skill overlap");
    if (matches(o.name, cfg.excludedTitles))
      reasons.push("Excluded seniority or role");
    const years = [
      ...text.matchAll(
        /(?:at least |minimum(?: of)? )?(\d+)\+?\s*(?:years|years�|years')\s*(?:of )?(?:\w+\s+){0,3}experience/gi,
      ),
    ].map((m) => Number(m[1]));
    if (
      cfg.maxRequiredYears !== undefined &&
      years.some((n) => n > cfg.maxRequiredYears)
    )
      reasons.push("Experience requirement exceeds configured limit");
  } else {
    if (p.productKeywords && !matches(text, p.productKeywords))
      reasons.push("Sector fit unverified");
    if (p.stageKeywords && !matches(text, p.stageKeywords))
      reasons.push("Stage fit unverified");
  }
  if (o.kind === "vc") {
    if (p.targetCountries && !includesTerm(text, p.targetCountries))
      reasons.push("Funding country eligibility unverified");
    const t = review?.terms;
    if (cfg.minFunding !== undefined || cfg.maxFundingEquity !== undefined) {
      if (
        !t?.liveVerified ||
        !t.complete ||
        !cfg.fundingCurrency ||
        t.currency !== cfg.fundingCurrency
      )
        reasons.push(
          "Funding amount, currency or equity preferences need verified terms",
        );
      else {
        if (
          cfg.minFunding !== undefined &&
          (!Number.isFinite(t.guaranteedCash) ||
            t.guaranteedCash < cfg.minFunding)
        )
          reasons.push(
            Number.isFinite(t.guaranteedCash)
              ? "Excluded funding amount"
              : "Funding amount unverified",
          );
        if (
          cfg.maxFundingEquity !== undefined &&
          (!Number.isFinite(t.maxTotalEquity) ||
            t.maxTotalEquity > cfg.maxFundingEquity)
        )
          reasons.push(
            Number.isFinite(t.maxTotalEquity)
              ? "Excluded equity terms"
              : "Total equity unverified",
          );
      }
    }
  }
  if (o.discovery && (!verified || review?.officialSource !== true))
    reasons.push(
      "Official source identity requires verification; search results are leads, not endorsements",
    );
  if (!review)
    reasons.push(
      "Missing information: compare mandatory requirements with your profile in Settings",
    );
  else {
    if (!fresh)
      reasons.push(
        "Missing information: eligibility review is unconfirmed or expired",
      );
    if (!evidence.length)
      reasons.push(
        "Missing information: review evidence is absent or no longer matches the official source",
      );
    if (!sourceCurrent)
      reasons.push(
        "Missing information: published requirements changed; review the current source again",
      );
    if (!snapshotCurrent)
      reasons.push(
        "Missing information: profile changed; confirm facts and review qualifications again",
      );
    if (verified && review.eligible === false)
      reasons.push(
        "Reviewed eligibility mismatch: " +
          (review.rationale || "A mandatory requirement is not met"),
      );
    else if (review.eligible !== true)
      reasons.push("Missing information: eligibility decision not confirmed");
  }
  if (!verified)
    for (const q of eligibilityQuestions(p, o.kind, text).filter(
      (q) => !q.known,
    ))
      reasons.push("Missing information to review: " + q.label);
  let golden = false;
  if (!reasons.length && verified) {
    if (o.kind === "job")
      golden =
        cfg.allowExceptionalCareer === true &&
        review.exceptionalCareer === true &&
        typeof review.careerReason === "string" &&
        review.careerReason.length >= 20;
    else {
      const t = review.terms;
      // A separate official terms URL and quotation are required; the search adapter validates them live.
      if (
        t?.liveVerified === true &&
        t.complete === true &&
        typeof cfg.fundingCurrency === "string" &&
        cfg.fundingCurrency.length > 0 &&
        t.currency === cfg.fundingCurrency &&
        Number.isFinite(t.guaranteedCash) &&
        t.guaranteedCash >= 0
      ) {
        const cash = t.guaranteedCash,
          equity = t.maxTotalEquity;
        golden =
          (t.nonDilutive === true &&
            equity === 0 &&
            Number.isFinite(cfg.minGrant) &&
            cash >= cfg.minGrant) ||
          (Number.isFinite(equity) &&
            equity >= 0 &&
            ((Number.isFinite(cfg.smallCheck) &&
              Number.isFinite(cfg.smallEquity) &&
              cash >= cfg.smallCheck &&
              equity <= cfg.smallEquity) ||
              (Number.isFinite(cfg.largeCheck) &&
                Number.isFinite(cfg.largeEquity) &&
                cash >= cfg.largeCheck &&
                equity <= cfg.largeEquity))) ||
          (Number.isFinite(cfg.millionCheck) &&
            cash >= cfg.millionCheck &&
            t.founderFriendly === true &&
            typeof t.rationale === "string" &&
            t.rationale.length >= 20) ||
          (cfg.allowExceptionalAccelerator === true &&
            t.exceptionalAccelerator === true &&
            typeof t.rationale === "string" &&
            t.rationale.length >= 20);
      }
    }
  }
  const disqualifications = reasons.filter((r) =>
    /^(Closed|Excluded|Location mismatch|Career title mismatch|Experience requirement|Reviewed eligibility mismatch)/.test(
      r,
    ),
  );
  const missingInformation = reasons.filter(
    (r) => !disqualifications.includes(r),
  );
  o.disqualifications = disqualifications;
  o.missingInformation = missingInformation;
  o.reviewPriority = disqualifications.length
    ? 0
    : Math.max(
        0,
        Math.min(100, o.score) - Math.min(40, missingInformation.length * 5),
      );
  o.eligibilityState = disqualifications.length
    ? "Disqualified"
    : missingInformation.length
      ? "Missing information"
      : "Verified";
  o.classification = disqualifications.length
    ? "Filtered Out"
    : missingInformation.length
      ? "Requires Verification"
      : golden
        ? "Golden Ticket"
        : "Strong Match";
  o.reasons = reasons.length
    ? reasons
    : [
        golden
          ? "Fresh intake, eligibility and exceptional value evidence verified"
          : "Fresh intake and eligibility verified; exceptional value not established",
      ];
  o.evidence = [
    { url: o.url, checked: o.checked, quote: text.slice(0, 500) },
    ...evidence,
  ];
  if (review?.terms?.liveVerified)
    o.evidence.push({
      url: review.terms.sourceUrl,
      checked: o.checked,
      quote: review.terms.quote,
    });
  if (
    o.classification === "Filtered Out" ||
    o.classification === "Requires Verification"
  )
    o.score = 0;
  return o;
}
