export type TargetLocation = {
  city?: string;
  region?: string;
  country?: string;
};
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
export function includesTerm(text: string, terms: string) {
  return terms
    .split(/[,\n]/)
    .map((x) => normalize(x.trim()))
    .filter(Boolean)
    .some((x) => normalize(text).includes(x));
}
export function locationsFor(p: any): TargetLocation[] {
  if (Array.isArray(p.locations)) return p.locations;
  // Preserve an old free-text location as a complete place, never silently OR city with state.
  return String(p.targetLocation || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [city, region, country] = line.split(",").map((s) => s.trim());
      return { city, region, country };
    });
}
export function locationDecision(
  location: string,
  p: any,
  mode: string,
): "match" | "mismatch" | "unknown" {
  const targets = locationsFor(p).filter(
    (x) => x.city || x.region || x.country,
  );
  if (!targets.length) return "match";
  if (!location.trim()) return "unknown";
  if (mode === "remote" && /worldwide|anywhere|global/i.test(location))
    return "match";
  if (
    targets.some((t) =>
      [t.city, t.region, t.country]
        .filter(Boolean)
        .every((v) => includesTerm(location, v!)),
    )
  )
    return "match";
  // A remote label alone supplies no evidence about permitted countries.
  if (mode === "remote" && /^remote(?:\s*[-/]?\s*)?$/i.test(location.trim()))
    return "unknown";
  if (targets.some((t) => t.city && includesTerm(location, t.city)))
    return "unknown"; // City present, but region/country information may be omitted; never infer a country.
  return "mismatch";
}
export function workMode(value: string) {
  return /hybrid/i.test(value)
    ? "hybrid"
    : /remote/i.test(value)
      ? "remote"
      : /on.?site|in.person/i.test(value)
        ? "onsite"
        : "";
}
export function sourceSummary(mode: string, p: any) {
  const places = locationsFor(p).map((t) =>
    [t.city, t.region, t.country].filter(Boolean).join(", "),
  );
  return mode === "job"
    ? `Locations: ${places.join(" OR ") || "any explicitly supported by selected sources"}; work modes: ${(p.workModes || []).join(", ") || "any"}; titles: ${p.jobTitleKeywords || "any"}; industries: ${p.industries || "any"}; employment: ${p.employmentTypes || "any"}`
    : `Countries: ${p.targetCountries || "any"}; sectors: ${p.productKeywords || "any"}; stages: ${p.stageKeywords || "any"}`;
}
