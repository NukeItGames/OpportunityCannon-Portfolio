import { sourceSummary } from "./preferences";
import * as cheerio from "cheerio";
import {
  canonical,
  key,
  blocked,
  opportunityIdentity,
  type Opportunity,
} from "./core";
import { matches as matchesPreference, classify, policy } from "./ranking";
export { matchesPreference };
import { request } from "./http";
export { request };
import { discoverSources } from "./discovery";
export async function vc(seed: any, profile: any = {}): Promise<Opportunity> {
  let resolved = seed.url;
  const html =
    seed.html ??
    (await request(seed.url, (url) => {
      resolved = url;
    }));
  const $ = cheerio.load(html);
  // Follow one unambiguous application destination, including navigation CTAs.
  // This is a public GET only. Multiple destinations need a human cohort review.
  const applicationLinks = new Set<string>();
  $("a[href]").each((_, a) => {
    const label = $(a).text().replace(/\s+/g, " ").trim();
    if (
      label.length > 100 ||
      !/\bapply\b|\bapplications?\b|\bpitch (?:us|your|a)\b/i.test(label) ||
      /how to|tips|guide|faq|technical|privacy/i.test(label)
    )
      return;
    try {
      const url = canonical(new URL($(a).attr("href")!, seed.url).href);
      if (url !== canonical(seed.url)) applicationLinks.add(url);
    } catch {
      /* Unsafe or non-web links are not discovery targets. */
    }
  });
  const emailEvidence = $('a[href^="mailto:"]')
    .toArray()
    .map((a) => ({
      label: $(a).text().trim(),
      context: $(a).parent().text().replace(/\s+/g, " ").trim(),
    }))
    .find((e) =>
      /pitch|investment|funding|founder|startup|send.*deck/i.test(
        e.label + " " + e.context,
      ),
    );
  $("script,style,nav,footer").remove();
  const text = $("body").text().replace(/\s+/g, " ");
  const closureNotice =
    /applications (are |have )?(closed|ended)|no longer accepting applications|\b(?:cohort|program(?:me)?|applications?)\b[^.!?\n]{0,100}\b(?:is|are|have|has)\s+(?:now\s+)?(?:closed|ended)\b/i.test(
      text,
    );
  // A past cohort/regular deadline must not suppress an explicit later intake.
  // Conflicting cohorts remain unverified even when a generic form is visible.
  const laterIntake =
    /\bapplications (?:are|remain) (?:now )?open\b|\bnow accepting applications\b|applications received[^.!?]{0,100}reviewed[^.!?]{0,40}rolling basis|late applications[^.!?]{0,80}(?:accepted|reviewed)/i.test(
      text,
    );
  let closed = closureNotice && !laterIntake;
  const hasApplicationForm = $("form")
    .toArray()
    .some(
      (f) =>
        /company|startup|pitch|founder/i.test($(f).text() + $(f).html()) &&
        $(f).find("input:not([type=hidden]),textarea,select").length >= 3,
    );
  let linkedEvidence:
    { url: string; checked: string; quote: string } | undefined;
  let linkedNote = "";
  if (!hasApplicationForm && applicationLinks.size === 1 && !closed) {
    const url = [...applicationLinks][0];
    try {
      const linked = cheerio.load(await request(url));
      linked("script,style,nav,footer").remove();
      const content = linked("body").text().replace(/\s+/g, " ");
      // A closed application control is stronger evidence than stale marketing
      // prose. Never infer open intake or personal eligibility from a link.
      const closure = linked("button,a,[role=button]")
        .toArray()
        .map((el) => linked(el).text().replace(/\s+/g, " ").trim())
        .find((label) =>
          /^(?:enrollment|applications?|intake)\s+(?:(?:is|are)\s+)?closed[.!]?$/i.test(
            label,
          ),
        );
      if (closure) closed = true;
      linkedEvidence = {
        url,
        checked: new Date().toISOString(),
        quote: closure || content.slice(0, 500),
      };
      linkedNote = closure
        ? `Linked application reports: ${closure}. ${url}`
        : `Linked application checked; intake and requirements still need review: ${url}`;
    } catch (e) {
      linkedNote = `Linked application could not be verified: ${url} (${(e as Error).message})`;
    }
  } else if (!hasApplicationForm && applicationLinks.size > 1) {
    linkedNote =
      "Multiple application destinations found; current cohort intake requires review.";
  }
  const accessible =
    $("form input").length > 0 ||
    $("a")
      .toArray()
      .some((a) => /apply|pitch|submit.*(startup|company)/i.test($(a).text()));
  const score =
    (matchesPreference(text, profile.productKeywords) ? 25 : 0) +
    (matchesPreference(text, profile.stageKeywords) ? 20 : 0) +
    (accessible && !closed ? 15 : 0) +
    (policy(profile).preferPreRevenue === true &&
    matchesPreference(
      "pre-revenue, pre revenue, pre-traction, idea stage",
      profile.stageKeywords,
    ) &&
    /pre.revenue|pre.traction|before.*revenue|day.zero/i.test(text)
      ? 10
      : 0) +
    (matchesPreference(text, profile.targetRegion) ? 5 : 0);
  const result: Opportunity = {
    id: "vc:" + key(seed.url),
    identityUrls: [
      ...new Set([
        canonical(seed.url),
        canonical(resolved),
        ...(seed.identityUrls || []),
      ]),
    ],
    kind: "vc",
    name: seed.name,
    company: seed.name,
    url: seed.url,
    score,
    status: "New",
    checked: new Date().toISOString(),
    verification: /email.only|email pitch route/i.test(seed.name)
      ? "EMAIL ONLY ? no browser application verified"
      : closed
        ? "Closed"
        : accessible
          ? "Intake link/form detected — eligibility needs review"
          : "Page reachable — intake unverified",
    discovery: seed.discovery,
    details: `${seed.context || ""}\nLive page excerpt: ${text.slice(0, 3500)}\n${linkedNote}\nScore is provisional: product /25, stage /20, activity /15, access /15, pre-revenue /10, check /10, preferred region /5. Unknown activity and terms score zero. Historical research is context, not fresh eligibility evidence.`,
  };
  // Only an application-specific form counts; generic input/newsletter forms do not.
  const intake = !(closureNotice && laterIntake) && hasApplicationForm;
  if (!intake)
    result.score = Math.max(0, result.score - (accessible && !closed ? 15 : 0));
  const reviewedRoute =
    policy(profile).reviews?.[canonical(seed.url)]?.intakeRoute;
  result.intakeRoute = intake
    ? "form"
    : reviewedRoute === "email" ||
        (emailEvidence && applicationLinks.size === 0)
      ? "email"
      : "unknown";
  result.verification =
    result.intakeRoute === "email"
      ? "EMAIL ONLY"
      : closed
        ? "Closed"
        : intake
          ? "Application form detected; eligibility review required"
          : "Intake unverified";
  const cfg = policy(profile);
  const review = cfg.reviews?.[canonical(seed.url)];
  if (review?.terms) {
    review.terms.liveVerified = false;
    try {
      const terms = review.terms;
      if (
        terms.official === true &&
        terms.sourceUrl &&
        terms.quote?.length >= 20
      ) {
        const doc = cheerio.load(await request(terms.sourceUrl));
        doc("script,style").remove();
        terms.liveVerified = doc("body")
          .text()
          .replace(/\s+/g, " ")
          .includes(terms.quote);
      }
    } catch {
      /* Unknown terms never qualify. */
    }
  }
  const classified = classify(
    result,
    { ...profile, discoveryPolicy: JSON.stringify(cfg) },
    text,
    intake && result.verification !== "EMAIL ONLY",
    closed,
  );
  if (linkedEvidence) classified.evidence!.push(linkedEvidence);
  if (emailEvidence && result.intakeRoute === "email")
    classified.evidence!.push({
      url: seed.url,
      checked: result.checked,
      quote: emailEvidence.context.slice(0, 500),
    });
  return classified;
}
export async function jobs(
  source: {
    type: string;
    board?: string;
    url?: string;
    name?: string;
    html?: string;
    discovery?: any;
    region?: string;
  },
  skills: string,
  profile: any = {},
): Promise<Opportunity[]> {
  let rows: any[] = [];
  if (!["jobposting", "lever", "greenhouse", "ashby"].includes(source.type))
    throw Error(
      "Unsupported source type. Configure a supported ATS board or an official JobPosting URL in Settings.",
    );
  if (source.type === "jobposting") {
    if (!source.url) throw Error("Official JobPosting URL required");
    const url = canonical(source.url);
    const html = source.html ?? (await request(url));
    const $ = cheerio.load(html);
    const j = $('script[type="application/ld+json"]')
      .toArray()
      .map((el) => {
        try {
          return JSON.parse($(el).text());
        } catch {
          return {};
        }
      })
      .flatMap((j) => (Array.isArray(j) ? j : [j, ...(j["@graph"] || [])]))
      .find(
        (j) =>
          j["@type"] === "JobPosting" ||
          (Array.isArray(j["@type"]) && j["@type"].includes("JobPosting")),
      );
    if (!j)
      throw Error(
        "Unsupported page: no readable JobPosting data. Add a supported employer feed or another official URL.",
      );
    rows = [
      {
        title: j.title,
        hiringOrganization: j.hiringOrganization,
        url,
        location:
          (Array.isArray(j.jobLocation) ? j.jobLocation : [j.jobLocation])
            .map((l: any) =>
              [
                l?.address?.addressLocality,
                l?.address?.addressRegion,
                typeof l?.address?.addressCountry === "string"
                  ? l.address.addressCountry
                  : l?.address?.addressCountry?.name,
              ]
                .filter(Boolean)
                .join(", "),
            )
            .filter(Boolean)
            .join("; ") ||
          (j.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
        intake: $("form")
          .toArray()
          .some(
            (f) =>
              /resume|curriculum|cover.?letter|bewerbung|candidature|apply.*job|job.*application/i.test(
                $(f).text() + $(f).html(),
              ) &&
              $(f).find("input:not([type=hidden]),textarea,select").length >= 3,
          ),
        employmentType: Array.isArray(j.employmentType)
          ? j.employmentType.join(", ")
          : j.employmentType,
        validThrough: j.validThrough,
        // JobPosting descriptions often omit mandatory application questions
        // (work authorization, sponsorship, attendance). Include public form
        // text in the review evidence without treating answers as supplied.
        description:
          (j.description || "") +
          "\n" +
          $("form")
            .toArray()
            .map((f) => {
              const form = $(f).clone();
              form.find("script,style,input[type=hidden]").remove();
              return form.text().replace(/\s+/g, " ");
            })
            .join("\n"),
        mode: j.jobLocationType === "TELECOMMUTE" ? "remote" : "",
        salary: "See verified compensation breakdown in description",
      },
    ];
  } else if (source.type === "greenhouse") {
    rows = JSON.parse(
      await request(
        `https://boards-api.greenhouse.io/v1/boards/${source.board}/jobs?content=true`,
      ),
    ).jobs.map((j: any) => ({
      ...j,
      url: j.absolute_url,
      location: [
        j.location?.name,
        ...(j.offices || []).map((x: any) => x.location || x.name),
      ]
        .filter(Boolean)
        .join("; "),
      description: j.content,
      mode: j.location?.name || "",
    }));
  } else if (source.type === "ashby") {
    rows = JSON.parse(
      await request(
        `https://api.ashbyhq.com/posting-api/job-board/${source.board}`,
      ),
    ).jobs.map((j: any) => ({
      ...j,
      title: j.title,
      url: j.applyUrl,
      location: j.location,
      description: j.descriptionHtml,
      mode: j.workplaceType,
      employmentType: j.employmentType || j.categories?.commitment,
    }));
  } else if (source.type === "lever") {
    rows = JSON.parse(
      await request(
        `https://${source.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${source.board}?mode=json`,
      ),
    ).map((j: any) => ({
      ...j,
      title: j.text,
      url: j.applyUrl,
      location: j.categories?.location,
      description:
        j.descriptionPlain +
        " " +
        (j.lists || []).map((x: any) => x.text + " " + x.content).join(" "),
      mode: j.workplaceType,
      employmentType: j.employmentType || j.categories?.commitment,
      salary: j.salaryRange
        ? `${j.salaryRange.min}–${j.salaryRange.max} ${j.salaryRange.currency} / ${j.salaryRange.interval}`
        : undefined,
    }));
  }
  return rows.map((j) => {
    const $ = cheerio.load(j.description || "");
    const details = $.text();
    const matches = skills
      .toLowerCase()
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter((x) => x.length > 1 && details.toLowerCase().includes(x));
    const result = {
      discovery: source.discovery,
      id: "job:" + key(j.url),
      kind: "job",
      name: j.title,
      company:
        j.hiringOrganization?.name ||
        source.name ||
        source.board ||
        new URL(source.url!).hostname,
      url: canonical(j.url),
      location: j.location,
      employmentType: j.employmentType,
      salary: j.salary || "Not stated in feed",
      mode: j.mode || "Review employer description",
      score: Math.max(
        0,
        Math.min(
          100,
          30 +
            (matchesPreference(j.title, profile.jobTitleKeywords) ? 25 : 0) +
            Math.min(45, matches.length * 5),
        ),
      ),
      status: "New",
      checked: new Date().toISOString(),
      verification:
        j.intake === false
          ? "JobPosting data found; application intake unverified"
          : source.type === "jobposting"
            ? "Application form detected; source identity and eligibility require review"
            : "Active ATS listing; personal eligibility unconfirmed",
      details:
        details.slice(0, 16000) +
        `\nMatched profile terms: ${matches.join(", ") || "None; complete your verified skills profile"}. Score reflects location, title and keyword overlap, not qualification.`,
    } as Opportunity;
    const expired = Boolean(
      j.validThrough &&
      (!Number.isFinite(Date.parse(j.validThrough)) ||
        Date.parse(j.validThrough) < Date.now()),
    );
    const closed =
      expired ||
      /no longer accepting|position (?:has been )?filled|job (?:is )?closed/i.test(
        details,
      );
    return classify(result, profile, details, j.intake !== false, closed);
  });
}
export async function search(
  kind: string,
  seeds: any[],
  settings: any,
  emit: (s: string) => void,
  save: (o: Opportunity) => void,
) {
  let count = 0;
  const classifications: Record<string, number> = {};
  const seen = new Set<string>();
  const offset = Math.max(0, Math.floor(policy(settings).sourceOffset || 0));
  emit(sourceSummary(kind, settings));
  const manual =
    kind === "vc" ? settings.fundingSources || [] : settings.boards || [];
  const discovered =
    settings.automaticDiscovery === false
      ? []
      : await discoverSources(kind, settings, emit);
  const sourceIds = new Set<string>();
  const uniqueSources = (list: any[]) =>
    list.filter((s: any) => {
      if (s.url && blocked(s.name || "", s.url, settings.excludedDomains))
        return false;
      const id = s.board
        ? `${s.type}:${s.region || ""}:${s.board}`
        : canonical(s.url);
      if (sourceIds.has(id)) return false;
      sourceIds.add(id);
      return true;
    });
  // Prefer the user's explicit configuration for duplicate sources, then share
  // the bounded run between both queues. A long saved list must not starve
  // automatic discovery, or Search never examines any newly found funding.
  const savedSources = uniqueSources(manual),
    newSources = uniqueSources(discovered);
  const combined: any[] = [];
  for (let i = 0; i < Math.max(savedSources.length, newSources.length); i++) {
    if (savedSources[i]) combined.push(savedSources[i]);
    if (newSources[i]) combined.push(newSources[i]);
  }
  const sources = combined.slice(
    offset,
    offset + Math.min(60, settings.limit || 12),
  );
  emit(
    `Source coverage: checking ${sources.filter((s) => savedSources.includes(s)).length} custom and ${sources.filter((s) => newSources.includes(s)).length} discovered sources; ${combined.length - sources.length} outside this run's budget/offset.`,
  );
  if (!sources.length)
    emit(
      `No reliable ${kind === "vc" ? "funding" : "job"} sources available for this search. Check discovery messages; refine profile terms or optionally add a custom source. No location or profession was substituted.`,
    );
  for (const source of sources) {
    const label = source.name || source.url || `${source.type}/${source.board}`;
    emit(`Checking ${label}`);
    try {
      const found =
        kind === "vc"
          ? [await vc(source, settings)]
          : await jobs(source, settings.skills || "", settings);
      for (const o of found) {
        const identity = opportunityIdentity(o.kind, o.url);
        if (seen.has(identity)) {
          emit(`Duplicate filtered: ${o.name}`);
          continue;
        }
        seen.add(identity);
        save(o);
        classifications[o.classification || "Requires Verification"] =
          (classifications[o.classification || "Requires Verification"] || 0) +
          1;
        count++;
      }
      emit(`${label}: ${found.length} result(s)`);
    } catch (e) {
      emit(`${label}: unavailable — ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  emit(
    `Finished: ${count} screened records (including filtered candidates). See each record for intake and eligibility limitations.`,
  );
  emit(
    `Quality totals: ${JSON.stringify(classifications)}. Coverage is limited to the discovered/custom sources checked in this run; missing results do not mean no opportunities exist.`,
  );
  return count;
}
