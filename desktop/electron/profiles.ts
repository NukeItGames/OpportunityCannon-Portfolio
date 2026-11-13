import { eligibilityFields } from "./eligibility";
import { policy } from "./ranking";
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  Store,
  canonical,
  opportunityIdentity,
  validStatus,
  identityKeys,
} from "./core";
export const sharedFields = [
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "linkedin",
  "website",
];
export const jobFields = [
  ...Object.keys(eligibilityFields.job),
  "industries",
  "employmentTypes",
  "experienceLevels",
  "targetLocation",
  "jobTitleKeywords",
  "skills",
  "discoveryPolicy",
  "workHistory",
  "education",
  "salaryExpectations",
  "portfolio",
  "preferences",
  "resume",
  "resumeText",
];
export const vcFields = [
  ...Object.keys(eligibilityFields.vc),
  "discoveryPolicy",
  "targetCountries",
  "productKeywords",
  "stageKeywords",
  "targetRegion",
  "excludedDomains",
  "founderBackground",
  "company",
  "companyWebsite",
  "description",
  "progress",
  "traction",
  "businessModel",
  "fundingGoals",
  "legalStructure",
  "deck",
];
export function emptyProfiles() {
  return {
    version: 1,
    shared: Object.fromEntries(sharedFields.map((k) => [k, ""])),
    job: {
      skills: "",
      workHistory: "",
      limit: 12,
      enabled: false,
      automaticDiscovery: true,
      targetLocation: "",
      jobTitleKeywords: "",
      locations: [],
      workModes: [],
      boards: [],
      customAnswers: [],
    },
    vc: {
      enabled: false,
      automaticDiscovery: true,
      limit: 12,
      boards: [],
      fundingSources: [],
      customAnswers: [],
    },
  };
}
export function validateProfiles(p: any) {
  if (!p || p.version !== 1 || JSON.stringify(p).length > 2000000)
    throw Error("Invalid profile format or size");
  for (const section of ["shared", "job", "vc"])
    if (
      !p[section] ||
      typeof p[section] !== "object" ||
      Array.isArray(p[section])
    )
      throw Error("Invalid profile section");
  for (const [section, fields] of [
    ["shared", sharedFields],
    ["job", jobFields],
    ["vc", vcFields],
  ] as const)
    for (const k of fields)
      if (p[section][k] !== undefined && typeof p[section][k] !== "string")
        throw Error("Profile values must be text");
  for (const mode of ["job", "vc"]) {
    const s = p[mode];
    policy(s);
    if (
      s.automaticDiscovery !== undefined &&
      typeof s.automaticDiscovery !== "boolean"
    )
      throw Error("Invalid automatic discovery setting");
    if (
      s.discoveryQueryLimit !== undefined &&
      (!Number.isInteger(s.discoveryQueryLimit) ||
        s.discoveryQueryLimit < 1 ||
        s.discoveryQueryLimit > 6)
    )
      throw Error("Discovery query limit must be 1-6");
    if (s.discoveryPolicy) {
      const cfg = JSON.parse(s.discoveryPolicy);
      if (!cfg || Array.isArray(cfg) || typeof cfg !== "object")
        throw Error("Discovery policy must be a JSON object");
    }
    if (!Array.isArray(s.customAnswers) || s.customAnswers.length > 500)
      throw Error("Invalid custom answers");
    for (const a of s.customAnswers) {
      if (
        typeof a.label !== "string" ||
        typeof a.value !== "string" ||
        !["text", "checkbox"].includes(a.type)
      )
        throw Error("Invalid custom answer");
      if (a.url) canonical(a.url);
    }
    if (
      s.locations !== undefined &&
      (!Array.isArray(s.locations) ||
        s.locations.length > 50 ||
        s.locations.some(
          (l: any) =>
            !l ||
            ["city", "region", "country"].some(
              (k) => l[k] !== undefined && typeof l[k] !== "string",
            ),
        ))
    )
      throw Error("Invalid target locations");
    if (
      s.workModes !== undefined &&
      (!Array.isArray(s.workModes) ||
        s.workModes.some(
          (m: any) => !["remote", "hybrid", "onsite"].includes(m),
        ))
    )
      throw Error("Invalid work modes");
    if (
      !Array.isArray(s.boards) ||
      s.boards.some((b: any) => {
        if (b.type === "jobposting") {
          try {
            canonical(b.url);
            return false;
          } catch {
            return true;
          }
        }
        return (
          !["lever", "greenhouse", "ashby", "jazzhr"].includes(b.type) ||
          !/^[-a-zA-Z0-9_]+$/.test(b.board)
        );
      })
    )
      throw Error("Invalid employer source");
    if (
      s.fundingSources !== undefined &&
      (!Array.isArray(s.fundingSources) ||
        s.fundingSources.length > 200 ||
        s.fundingSources.some((f: any) => {
          try {
            canonical(f.url);
            return typeof f.name !== "string";
          } catch {
            return true;
          }
        }))
    )
      throw Error("Invalid funding sources");
    s.limit = Math.max(1, Math.min(60, Number(s.limit) || 12));
  }
  return p;
}
export function packetFields(p: any, mode: "job" | "vc", url: string) {
  if (p[mode].enabled === false) return { customAnswers: [] };
  const s = p[mode],
    fields: any = {};
  for (const k of [
    ...sharedFields,
    ...(mode === "job" ? jobFields : vcFields),
  ].filter(
    (k) =>
      ![
        ...Object.keys(eligibilityFields.job),
        ...Object.keys(eligibilityFields.vc),
        "discoveryPolicy",
        "resume",
        "deck",
        "industries",
        "employmentTypes",
        "experienceLevels",
        "targetCountries",
        "targetLocation",
        "jobTitleKeywords",
        "productKeywords",
        "stageKeywords",
        "targetRegion",
        "excludedDomains",
      ].includes(k),
  ))
    if (typeof (p.shared[k] ?? s[k]) === "string" && (p.shared[k] ?? s[k]))
      fields[k] = p.shared[k] ?? s[k];
  if (mode === "vc" && s.companyWebsite) fields.website = s.companyWebsite;
  // Application-specific answers are exported only for an exact application URL.
  fields.customAnswers = (s.customAnswers || []).filter(
    (a: any) => a.url && canonical(a.url) === canonical(url),
  );
  return fields;
}
export function encryptBackup(data: any, password: string) {
  if (typeof password !== "string" || password.length < 12)
    throw Error("Use a backup password of at least 12 characters");
  const salt = randomBytes(16),
    iv = randomBytes(12),
    key = scryptSync(password, salt, 32);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from("Cannon backup v1"));
  const body = Buffer.concat([
    c.update(JSON.stringify(data), "utf8"),
    c.final(),
  ]);
  key.fill(0);
  return JSON.stringify({
    format: "cannon-backup",
    version: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    body: body.toString("base64"),
  });
}
export function decryptBackup(raw: string, password: string) {
  if (raw.length > 100000000) throw Error("Backup too large");
  try {
    const e = JSON.parse(raw);
    if (e.format !== "cannon-backup" || e.version !== 1) throw Error();
    const salt = Buffer.from(e.salt, "base64"),
      iv = Buffer.from(e.iv, "base64"),
      tag = Buffer.from(e.tag, "base64");
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16)
      throw Error();
    const key = scryptSync(password, salt, 32),
      d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAAD(Buffer.from("Cannon backup v1"));
    d.setAuthTag(tag);
    try {
      return JSON.parse(
        Buffer.concat([
          d.update(Buffer.from(e.body, "base64")),
          d.final(),
        ]).toString("utf8"),
      );
    } finally {
      key.fill(0);
    }
  } catch {
    throw Error(
      "Unable to unlock backup: wrong password, unsupported format or damaged file",
    );
  }
}
export function previewImport(db: Store, s: any) {
  if (
    !s ||
    !Array.isArray(s.opportunities) ||
    !Array.isArray(s.settings) ||
    !Array.isArray(s.history) ||
    !Array.isArray(s.packets)
  )
    throw Error("Invalid data archive");
  const ids = new Set(db.list().map((o) => o.id));
  const identities = new Set(
    db.list().flatMap((o) => identityKeys(o).map((key) => o.kind + ":" + key)),
  );
  const exists = (r: any) =>
    ids.has(r.id) ||
    identityKeys(r.body).some((key) => identities.has(r.body.kind + ":" + key));
  for (const r of s.opportunities)
    if (
      typeof r.id !== "string" ||
      !r.body ||
      r.body.id !== r.id ||
      !["vc", "job"].includes(r.body.kind) ||
      !validStatus(r.body.status)
    )
      throw Error("Invalid opportunity");
  for (const r of s.opportunities) {
    canonical(r.body.url);
    if (
      r.body.identityUrls !== undefined &&
      (!Array.isArray(r.body.identityUrls) || r.body.identityUrls.length > 100)
    )
      throw Error("Invalid identity aliases");
    identityKeys(r.body);
  }
  for (const r of s.history)
    if (
      typeof r.opportunity !== "string" ||
      typeof r.changed !== "string" ||
      !validStatus(r.status)
    )
      throw Error("Invalid history");
  for (const r of s.settings) {
    if (typeof r.id !== "string") throw Error("Invalid setting");
    if (r.id === "profiles-v1") validateProfiles(r.body);
  }
  return {
    newOpportunities: s.opportunities.filter((r: any) => !exists(r)).length,
    conflictingOpportunities: s.opportunities.filter((r: any) => exists(r))
      .length,
    settings: s.settings.length,
    history: s.history.length,
    packets: s.packets.length,
    profilePreview: s.settings
      .filter((r: any) =>
        ["profiles-v1", "profile-job", "profile-vc"].includes(r.id),
      )
      .map((r: any) => ({
        id: r.id,
        values: r.body,
        existing: db.get(r.id, null) !== null,
      })),
    opportunityPreview: s.opportunities.map((r: any) => ({
      name: r.body.name,
      status: r.body.status,
      existing: exists(r),
    })),
    policy:
      "Merge only. Existing records and profiles win. Credentials excluded. Legacy profiles require separate review.",
  };
}
export function mergeImport(db: Store, s: any) {
  previewImport(db, s);
  db.transaction(() => {
    const remap = new Map<string, string>();
    for (const r of s.opportunities) {
      const existing = db.equivalent(r.body)[0];
      const body = existing
        ? {
            ...r.body,
            ...existing,
            applied: existing.applied || r.body.applied,
            identityUrls: [
              ...new Set([
                r.body.url,
                ...(r.body.identityUrls || []),
                existing.url,
                ...(existing.identityUrls || []),
              ]),
            ],
          }
        : { ...r.body };
      // Imported protected evidence can strengthen, never weaken, protection.
      const protectedHistory = s.history.find(
        (h: any) =>
          h.opportunity === r.id && ["Applied", "Rejected"].includes(h.status),
      );
      if (!["Applied", "Rejected"].includes(body.status)) {
        if (["Applied", "Rejected"].includes(r.body.status))
          body.status = r.body.status;
        else if (protectedHistory) body.status = protectedHistory.status;
      }
      remap.set(r.id, db.put(body));
    }
    db.reconcile();
    for (const r of s.settings)
      if (!["integrations", "googleAuth", "browser-tasks-v1"].includes(r.id))
        db.db
          .prepare("INSERT OR IGNORE INTO settings VALUES (?,?)")
          .run(r.id, db.encode(r.body));
    for (const row of s.history) {
      const r = {
        ...row,
        opportunity: remap.get(row.opportunity) || row.opportunity,
      };
      if (
        !db.db
          .prepare(
            "SELECT 1 FROM history WHERE opportunity=? AND changed=? AND status=?",
          )
          .get(r.opportunity, r.changed, r.status)
      )
        db.db
          .prepare(
            "INSERT INTO history(opportunity,changed,status) VALUES (?,?,?)",
          )
          .run(r.opportunity, r.changed, r.status);
    }
    for (const r of s.packets)
      if (
        !db.db.prepare("SELECT 1 FROM packets WHERE created=?").get(r.created)
      )
        db.db
          .prepare("INSERT INTO packets(created,body) VALUES (?,?)")
          .run(r.created, db.encode(r.body));
  });
}
