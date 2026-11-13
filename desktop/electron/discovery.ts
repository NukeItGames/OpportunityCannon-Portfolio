import * as cheerio from "cheerio";
import { canonical, blocked } from "./core";
import { request } from "./http";
import { locationsFor } from "./preferences";
export type Source = {
  type?: string;
  board?: string;
  region?: string;
  url?: string;
  name: string;
  html?: string;
  identityUrls?: string[];
  snippet?: string;
  depth?: number;
  discovery?: {
    provider: string;
    query: string;
    resultUrl: string;
    checked: string;
    method: string;
  };
};
const terms = (s: any, n = 2) =>
  String(s || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, n)
    .map((x) => x.slice(0, 80))
    .join(" ");
const matchesSubject = (text: string, preference = "") =>
  preference
    .split(/[,\n]/)
    .filter(Boolean)
    .some((t) =>
      text.toLocaleLowerCase().includes(t.trim().toLocaleLowerCase()),
    );
// Only explicit discovery preferences leave the machine. Never identity, resume,
// employer history, company name, private answers, revenue, credentials or deck.
export function discoveryQueries(kind: string, p: any) {
  const places =
    kind === "job"
      ? locationsFor(p).map((l) =>
          [...new Set([l.city, l.region, l.country].filter(Boolean))].join(" "),
        )
      : (String(p.targetCountries || "")
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean).length
          ? String(p.targetCountries)
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [""]
        ).map((country) =>
          [
            ...new Set([terms(p.targetRegion, 2), country].filter(Boolean)),
          ].join(" "),
        );
  const subjectTerms = String(
    kind === "job" ? p.jobTitleKeywords || "" : p.productKeywords || "",
  )
    .split(/[,\n]/)
    .map((s) => s.trim().slice(0, 80))
    .filter(Boolean);
  if (!subjectTerms.length) return [];
  const subjects: string[] = [];
  for (let i = 0; i < subjectTerms.length; i += 2)
    subjects.push(subjectTerms.slice(i, i + 2).join(" "));
  const geographic = places.filter(Boolean);
  if (!geographic.length)
    geographic.push(p.workModes?.includes("remote") ? "remote" : "");
  const queries: string[] = [],
    focused: string[] = [];
  for (const subject of subjects) {
    for (const place of geographic.slice(0, 3)) {
      if (kind === "job") {
        const remote =
          p.workModes?.length === 1 && p.workModes[0] === "remote"
            ? "remote"
            : "";
        const context = [subject, place, terms(p.industries, 1), remote]
          .filter(Boolean)
          .join(" ");
        queries.push(`${context} jobs careers apply`);
        focused.push(
          `${subject} ${place} (site:jobs.lever.co OR site:job-boards.greenhouse.io OR site:jobs.ashbyhq.com)`,
        );
      } else {
        const context = [subject, terms(p.stageKeywords, 1), place]
          .filter(Boolean)
          .join(" ");
        queries.push(`${context} accelerator funding apply`);
        focused.push(`${context} investors grants application official`);
      }
    }
  }
  return [...new Set([...queries, ...focused])].slice(
    0,
    Math.min(6, Math.max(1, p.discoveryQueryLimit || 4)),
  );
}
export function parseSearch(html: string, query: string) {
  if (
    /anomaly\.js|anomaly-modal|bots use DuckDuckGo|verify you are human/i.test(
      html,
    )
  )
    throw Error(
      "Search provider requires human verification; automatic discovery stopped without bypassing it.",
    );
  const $ = cheerio.load(html);
  const results: Source[] = [];
  $(".result__a").each((_, el) => {
    try {
      const raw = $(el).attr("href") || "";
      const u = new URL(raw, "https://duckduckgo.com");
      const target = u.searchParams.get("uddg") || u.href;
      const url = canonical(target);
      const host = new URL(url).hostname;
      if (/(^|\.)duckduckgo\.com$/.test(host)) return;
      results.push({
        url,
        name: $(el).text().trim(),
        snippet: $(el)
          .closest(".result")
          .find(".result__snippet")
          .text()
          .trim(),
        discovery: {
          provider: "DuckDuckGo HTML",
          query,
          resultUrl: url,
          checked: new Date().toISOString(),
          method: "Search result; source identity requires verification",
        },
      });
    } catch {}
  });
  return results;
}
export function atsSource(url: string): Source | undefined {
  const u = new URL(canonical(url)),
    parts = u.pathname.split("/").filter(Boolean);
  const host = u.hostname.toLowerCase();
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(host) && parts[0])
    return {
      type: "lever",
      region: host === "jobs.eu.lever.co" ? "eu" : undefined,
      board: parts[0],
      name: parts[0],
      url: u.href,
    };
  if (
    ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(host) &&
    parts[0]
  )
    return { type: "greenhouse", board: parts[0], name: parts[0], url: u.href };
  if (host === "jobs.ashbyhq.com" && parts[0])
    return { type: "ashby", board: parts[0], name: parts[0], url: u.href };
}
const excludedDirectory = (url: string) =>
  [
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "crunchbase.com",
    "f6s.com",
    "wikipedia.org",
    "youtube.com",
    "facebook.com",
    "reddit.com",
  ].some(
    (h) =>
      new URL(url).hostname === h || new URL(url).hostname.endsWith("." + h),
  );
export function fundingDirectory(url: string, title: string) {
  const u = new URL(url);
  return (
    /\b(top|best|list of|directory|toolkit|funding guide|funding co-pilot|accelerators in|accelerators for|grants for startups|investors backing|partner list|how to|who funds)\b/i.test(
      title,
    ) ||
    /\/(?:guides?|blogs?|articles?|toolkits?)\//i.test(u.pathname) ||
    /\/(?:startup-accelerators-\d{4}|funding)\/(?:country|city|industry|sector)(?:\/|$)/i.test(
      u.pathname,
    ) ||
    /^(?:blog|blogs)\./i.test(u.hostname)
  );
}
export async function discoverSources(
  kind: string,
  p: any,
  emit: (s: string) => void,
  read: (
    url: string,
    resolved?: (url: string) => void,
  ) => Promise<string> = request,
): Promise<Source[]> {
  const queries = discoveryQueries(kind, p);
  if (!queries.length) {
    emit(
      "Automatic discovery needs a job title/profession or startup sector in your profile. No default profession or place was substituted.",
    );
    return [];
  }
  emit(
    "Discovery queries are bounded by your query budget; additional role/sector/location combinations may remain unsearched. Review the queries below for actual coverage.",
  );
  const candidates: Source[] = [];
  const found: Source[] = [];
  const visited = new Set<string>(),
    identities = new Set<string>();
  const hostVisits = new Map<string, number>();
  const limit = Math.min(12, Math.max(1, Number(p.limit) || 12));
  function add(s: Source) {
    const id = s.board
      ? `${s.type}:${s.region || ""}:${s.board}`
      : canonical(s.url!);
    if (identities.has(id)) return;
    identities.add(id);
    found.push(s);
    emit(
      `Discovered ${s.type || "funding page"}: ${s.name} (${s.url || s.board})`,
    );
  }
  for (const q of queries) {
    emit(`Automatic ${kind} discovery query: ${q}`);
    try {
      const rows = parseSearch(
        await read(
          "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q),
        ),
        q,
      );
      emit(
        `Search provider returned ${rows.length} candidate links; these are not verified opportunities.`,
      );
      candidates.push(...rows.slice(0, 10));
    } catch (e) {
      emit(`Automatic discovery coverage limitation: ${(e as Error).message}`);
      if (/human verification/.test((e as Error).message)) break;
    }
  }
  if (
    (kind === "job"
      ? locationsFor(p).length
      : String(p.targetCountries || "")
          .split(/[,\n]/)
          .filter(Boolean).length) > 3
  )
    emit(
      "Coverage limitation: automatic discovery queries cover the first three target locations in this run; all configured locations still apply to filtering.",
    );
  // Prefer relevant source titles/snippets over unrelated ATS boards. Snippets
  // prioritize crawling only; they are never qualification or terms evidence.
  const relevance = (s: Source) => {
    const text = (s.name + " " + (s.snippet || "")).toLocaleLowerCase();
    const subjects = String(
      kind === "job" ? p.jobTitleKeywords : p.productKeywords,
    )
      .split(/[,\n]/)
      .map((x) => x.trim().toLocaleLowerCase())
      .filter(Boolean);
    const placeTokens = (
      kind === "job"
        ? locationsFor(p).flatMap((l) => [l.city, l.country])
        : [p.targetCountries, p.targetRegion]
    )
      .filter(Boolean)
      .map((x) => String(x).toLocaleLowerCase());
    const directory =
      /\b(top|best|list of|directory|guide|accelerators in|grants for startups)\b/i.test(
        s.name,
      );
    return (
      (subjects.some((t) => text.includes(t)) ? 8 : 0) +
      (placeTokens.some((t) => text.includes(t)) ? 2 : 0) +
      (atsSource(s.url!) ? 1 : 0) -
      (directory ? 8 : 0)
    );
  };
  candidates.sort((a, b) => relevance(b) - relevance(a));
  while (candidates.length) {
    if (found.length >= limit || visited.size >= Math.min(18, limit * 3)) break;
    const candidate = candidates.shift()!;
    const url = candidate.url!;
    const host = new URL(url).hostname;
    if (
      visited.has(url) ||
      excludedDirectory(url) ||
      blocked("", url, p.excludedDomains)
    )
      continue;
    if ((hostVisits.get(host) || 0) >= 4) continue;
    hostVisits.set(host, (hostVisits.get(host) || 0) + 1);
    visited.add(url);
    try {
      const ats = kind === "job" ? atsSource(url) : undefined;
      if (ats) {
        add({ ...ats, discovery: candidate.discovery });
        continue;
      }
      let resolved = url;
      const html = await read(url, (value) => {
        resolved = value;
      });
      candidate.identityUrls = [url, resolved];
      const $ = cheerio.load(html);
      if (kind === "job") {
        if (
          $('script[type="application/ld+json"]')
            .toArray()
            .some((el) => /JobPosting/.test($(el).text()))
        ) {
          add({ ...candidate, type: "jobposting", html });
          continue;
        }
        let linked = 0;
        const links = $("a[href]")
          .toArray()
          .sort(
            (a, b) =>
              Number(matchesSubject($(b).text(), p.jobTitleKeywords)) -
              Number(matchesSubject($(a).text(), p.jobTitleKeywords)),
          );
        for (const el of links) {
          if (linked >= 2 || found.length >= limit) break;
          try {
            const link = canonical(new URL($(el).attr("href")!, url).href);
            const board = atsSource(link);
            if (board) {
              add({
                ...board,
                discovery: {
                  ...candidate.discovery!,
                  method: "Employer/career page linked to ATS",
                },
              });
              linked++;
            } else if (
              new URL(link).hostname === new URL(url).hostname &&
              (candidate.depth || 0) < 2 &&
              /job|career|vacanc|stellen|emploi/i.test(
                $(el).text() + " " + new URL(link).pathname,
              ) &&
              !visited.has(link)
            ) {
              candidates.unshift({
                ...candidate,
                url: link,
                depth: (candidate.depth || 0) + 1,
              });
              linked++;
            }
          } catch {}
        }
        if (!linked)
          emit(
            `Unsupported career page: ${url}; no readable JobPosting or supported ATS link.`,
          );
      } else {
        // Directories are coverage records, never opportunities.
        if (
          fundingDirectory(url, candidate.name) ||
          /\b(top|best|list of|partner list|directory|wikipedia|how to|who funds|accelerators in|accelerators for|grants for startups|grants in|startup accelerators in|funding guide|funding co-pilot|investors backing|\d+ (?:active )?(?:venture )?(?:funds|programs))\b/i.test(
            candidate.name,
          ) ||
          /\bgrants for [^.!?]{1,100} startups in\b/i.test(candidate.name) ||
          /\/(?:guides?|blogs?|articles?)\//i.test(new URL(url).pathname) ||
          /\/funding\/(?:country|city|industry|sector)\//i.test(
            new URL(url).pathname,
          ) ||
          /^(?:blog|blogs)\./i.test(new URL(url).hostname)
        ) {
          let linked = 0;
          for (const el of $("a[href]").toArray()) {
            if (linked >= 3) break;
            try {
              const target = canonical(new URL($(el).attr("href")!, url).href);
              if (
                new URL(target).hostname !== new URL(url).hostname &&
                /^(?:official (?:website|site)|website|visit (?:website|site)|apply now)$/i.test(
                  $(el).text().trim(),
                ) &&
                !excludedDirectory(target)
              ) {
                candidates.unshift({
                  ...candidate,
                  url: target,
                  name: $(el).attr("title") || new URL(target).hostname,
                  discovery: {
                    ...candidate.discovery!,
                    method:
                      "Directory linked to external organization; identity unverified",
                  },
                });
                linked++;
              }
            } catch {}
          }
          emit(`Directory/article skipped: ${url}`);
          continue;
        }
        if (
          $('input[type="password"]').length &&
          !$("form")
            .toArray()
            .some(
              (f) =>
                /startup|pitch|founder|company name/i.test($(f).text()) &&
                $(f).find("input:not([type=hidden]),textarea,select").length >=
                  3,
            )
        ) {
          emit(
            `Funding portal requires sign-in; no public application verified: ${url}`,
          );
          continue;
        }
        let application: string | undefined;
        for (const el of $("a[href]").toArray()) {
          try {
            const link = canonical(new URL($(el).attr("href")!, url).href);
            if (
              new URL(link).hostname === new URL(url).hostname &&
              /\/(?:apply|application|pitch|bewerb|candidatur)(?:\/|$)|\/apply-now(?:\/|$)/i.test(
                new URL(link).pathname,
              ) &&
              !/faq|analysis|toolkit|guide|\/api\//i.test(
                new URL(link).pathname,
              ) &&
              link !== url
            ) {
              application = link;
              break;
            }
          } catch {}
        }
        if (application && !visited.has(application)) {
          visited.add(application);
          try {
            const applicationAliases = [application];
            const applicationHtml = await read(application, (value) =>
              applicationAliases.push(value),
            );
            add({
              ...candidate,
              url: application,
              identityUrls: applicationAliases,
              html: applicationHtml,
              discovery: {
                ...candidate.discovery!,
                method: "Funding page linked to application",
              },
            });
          } catch (e) {
            emit(
              `Application unavailable: ${application}: ${(e as Error).message}`,
            );
            add({ ...candidate, html });
          }
        } else add({ ...candidate, html });
      }
    } catch (e) {
      emit(`Source validation unavailable: ${url}: ${(e as Error).message}`);
    }
  }
  if (candidates.length)
    emit(
      "Coverage limitation: source/query crawl budget reached; additional indexed candidates were not checked in this run.",
    );
  emit(
    `Automatic discovery found ${found.length} sources. Coverage is search-index dependent, not exhaustive; official identity, intake, eligibility and terms are checked separately.`,
  );
  return found;
}
