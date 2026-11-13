import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
export type Opportunity = {
  id: string;
  kind: "vc" | "job";
  name: string;
  company: string;
  url: string;
  score: number;
  // Sorting assistance for unverified leads only; never qualification evidence.
  reviewPriority?: number;
  status: string;
  checked: string;
  details: string;
  location?: string;
  employmentType?: string;
  salary?: string;
  mode?: string;
  verification: string;
  classification?:
    "Golden Ticket" | "Strong Match" | "Requires Verification" | "Filtered Out";
  reasons?: string[];
  eligibilitySource?: string;
  eligibilityState?: "Missing information" | "Disqualified" | "Verified";
  missingInformation?: string[];
  disqualifications?: string[];
  discovery?: {
    provider: string;
    query: string;
    resultUrl: string;
    checked: string;
    method: string;
  };
  evidence?: { url: string; checked?: string; quote: string }[];
  identityUrls?: string[];
  intakeRoute?: "form" | "email" | "unknown";
  applied?: string;
  notes?: string;
  followUp?: string;
};
export function compareOpportunities(a: Opportunity, b: Opportunity) {
  const weight = (o: Opportunity) =>
    ({
      "Golden Ticket": 3,
      "Strong Match": 2,
      "Requires Verification": 1,
      "Filtered Out": 0,
    })[o.classification || "Requires Verification"];
  return (
    weight(b) - weight(a) ||
    (a.classification === "Requires Verification" &&
    b.classification === "Requires Verification"
      ? (b.reviewPriority || 0) - (a.reviewPriority || 0)
      : b.score - a.score)
  );
}
export function canonical(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:")
    throw Error("Only HTTPS application URLs are allowed");
  if (
    u.username ||
    u.password ||
    u.port ||
    !u.hostname.includes(".") ||
    /^(?:\d+\.){3}\d+$/.test(u.hostname) ||
    /(?:\.local|\.internal|\.localhost)$/.test(u.hostname) ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)
  )
    throw Error("Public URLs only");
  for (const k of [...u.searchParams.keys()])
    if (k.startsWith("utm_")) u.searchParams.delete(k);
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}
// Identity is separate from the exact URL used for browser permission/task delivery.
// Unknown query parameters remain significant; never guess arbitrary redirect targets.
export function opportunityIdentity(kind: string, url: string) {
  const u = new URL(canonical(url));
  const parts = u.pathname.split("/").filter(Boolean);
  if (kind === "job") {
    if (
      ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(u.hostname)
    ) {
      const posting =
        parts[1] === "jobs" ? parts[2] : u.searchParams.get("gh_jid");
      if (parts[0] && posting && /^\d+$/.test(posting))
        return `greenhouse:${parts[0].toLowerCase()}:${posting}`;
    }
    if (/^jobs\.(?:eu\.)?lever\.co$/.test(u.hostname) && parts.length >= 2)
      return `lever:${u.hostname}:${parts[0].toLowerCase()}:${parts[1]}`;
    if (u.hostname === "jobs.ashbyhq.com" && parts.length >= 2)
      return `ashby:${parts[0].toLowerCase()}:${parts[1]}`;
  }
  for (const k of [...u.searchParams.keys()])
    if (/^(?:utm_.*|gclid|fbclid|msclkid)$/.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.toString().replace(/\/$/, "");
}
export function identityKeys(o: Opportunity) {
  return [o.url, ...(o.identityUrls || [])].map((url) =>
    opportunityIdentity(o.kind, url),
  );
}
export const protectedStatus = (s: string) =>
  ["Applied", "Rejected"].includes(s);
export const validStatus = (s: string) =>
  ["New", "Saved", "Skipped", "Applied", "Rejected"].includes(s);
export function key(url: string) {
  return createHash("sha256").update(canonical(url)).digest("hex").slice(0, 24);
}
export function blocked(_name: string, url: string, domains: string = "") {
  const host = new URL(canonical(url)).hostname.toLowerCase();
  return domains
    .split(/[,\n]/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .some((d) => host === d || host.endsWith("." + d));
}
export class Store {
  db: DatabaseSync;
  private inTransaction = false;
  constructor(
    path: string,
    private codec?: {
      seal: (s: string) => string;
      open: (s: string) => string;
    },
  ) {
    this.db = new DatabaseSync(path);
    if (
      Number(
        (this.db.prepare("PRAGMA user_version").get() as any).user_version,
      ) > 2
    ) {
      this.db.close();
      throw Error(
        "This database requires a newer version of Opportunity Cannon",
      );
    }

    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, opportunity TEXT, changed TEXT, status TEXT); CREATE TABLE IF NOT EXISTS packets(id INTEGER PRIMARY KEY, created TEXT, body TEXT);",
    );
    if (codec) {
      let migrated = false;
      this.db.exec("PRAGMA secure_delete=ON; BEGIN IMMEDIATE");
      try {
        for (const table of ["opportunities", "settings", "packets"]) {
          for (const r of this.db
            .prepare(`SELECT id,body FROM ${table}`)
            .all() as any[]) {
            if (!r.body.startsWith("dpapi:")) {
              this.db
                .prepare(`UPDATE ${table} SET body=? WHERE id=?`)
                .run(this.encode(JSON.parse(r.body)), r.id);
              migrated = true;
            } else this.decode(r.body); // Fail closed on a different Windows account.
          }
        }
        this.db.exec("PRAGMA user_version=2; COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
      if (migrated) this.db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM");
    }
    this.transaction(() => this.reconcile());
  }
  encode(v: any) {
    const s = JSON.stringify(v);
    return this.codec ? "dpapi:" + this.codec.seal(s) : s;
  }
  decode(s: string) {
    return JSON.parse(
      s.startsWith("dpapi:") ? this.codec!.open(s.slice(6)) : s,
    );
  }
  transaction(fn: () => void) {
    if (this.inTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.inTransaction = false;
    }
  }
  snapshot() {
    return Object.fromEntries(
      ["opportunities", "settings", "history", "packets"].map((t) => [
        t,
        this.db
          .prepare(`SELECT * FROM ${t}`)
          .all()
          .map((r: any) =>
            r.body === undefined ? r : { ...r, body: this.decode(r.body) },
          ),
      ]),
    );
  }
  list(): Opportunity[] {
    return this.db
      .prepare("SELECT body FROM opportunities")
      .all()
      .map((r: any) => this.decode(r.body))
      .sort(compareOpportunities);
  }
  equivalent(o: Opportunity) {
    const identities = new Set(identityKeys(o));
    return this.list().filter(
      (x) =>
        x.kind === o.kind && identityKeys(x).some((key) => identities.has(key)),
    );
  }
  isProtected(o: Opportunity) {
    return this.equivalent(o).some((x) => protectedStatus(x.status));
  }
  // Called inside a transaction at startup/import. Preserve history rows, including
  // alias provenance in packets; history references follow the surviving record.
  reconcile() {
    const records = this.list();
    const counts = new Map<string, number>();
    for (const o of records)
      for (const key of new Set(identityKeys(o))) {
        const id = o.kind + ":" + key;
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    for (const o of records)
      if (
        identityKeys(o).some((key) => (counts.get(o.kind + ":" + key) || 0) > 1)
      )
        this.put(o);
  }
  put(o: Opportunity): string {
    if (!this.inTransaction) {
      let id = "";
      this.transaction(() => {
        id = this.put(o);
      });
      return id;
    }
    canonical(o.url);
    if (!o.id || !["job", "vc"].includes(o.kind) || !validStatus(o.status))
      throw Error("Invalid opportunity");
    const records = this.list();
    const byId = records.find((x) => x.id === o.id);
    const identities = new Set(identityKeys(o));
    let aliases: Opportunity[] = [],
      changed = true;
    while (changed) {
      changed = false;
      for (const x of records)
        if (
          x.kind === o.kind &&
          !aliases.includes(x) &&
          identityKeys(x).some((key) => identities.has(key))
        ) {
          aliases.push(x);
          identityKeys(x).forEach((key) => identities.add(key));
          changed = true;
        }
    }
    if (byId && !aliases.some((x) => x.id === byId.id))
      throw Error("Opportunity ID collision");
    const old = aliases.find((x) => protectedStatus(x.status)) || aliases[0];
    if (old) {
      const status = protectedStatus(old.status)
        ? old.status
        : protectedStatus(o.status)
          ? o.status
          : old.status;
      o = {
        ...o,
        identityUrls: [
          ...new Set([
            o.url,
            ...(o.identityUrls || []),
            ...aliases.flatMap((x) => [x.url, ...(x.identityUrls || [])]),
          ]),
        ],
        id: old.id,
        status,
        applied: old.applied || o.applied,
        notes: old.notes,
        followUp: old.followUp,
      };
      for (const alias of aliases) {
        if (alias.id === old.id) continue;
        this.db
          .prepare("UPDATE history SET opportunity=? WHERE opportunity=?")
          .run(old.id, alias.id);
        this.db.prepare("DELETE FROM opportunities WHERE id=?").run(alias.id);
      }
    }
    this.db
      .prepare("INSERT OR REPLACE INTO opportunities VALUES (?,?)")
      .run(o.id, this.encode(o));
    return o.id;
  }
  status(id: string, status: string, reviewedReopen = false) {
    if (!validStatus(status)) throw Error("Invalid status");
    const o = this.list().find((x) => x.id === id);
    if (!o) throw Error("Unknown opportunity");
    if (this.isProtected(o) && !protectedStatus(status) && !reviewedReopen)
      throw Error(
        "Review and explicitly confirm reopening this applied/rejected opportunity",
      );
    this.transaction(() => {
      o.status = status;
      if (status === "Applied") o.applied ||= new Date().toISOString();
      this.db
        .prepare("UPDATE opportunities SET body=? WHERE id=?")
        .run(this.encode(o), id);
      this.db
        .prepare(
          "INSERT INTO history(opportunity,changed,status) VALUES (?,?,?)",
        )
        .run(id, new Date().toISOString(), status);
    });
  }
  notes(id: string, notes: string, followUp: string) {
    const o = this.list().find((x) => x.id === id);
    if (!o) throw Error("Unknown opportunity");
    o.notes = notes.slice(0, 10000);
    o.followUp = followUp;
    this.db
      .prepare("UPDATE opportunities SET body=? WHERE id=?")
      .run(this.encode(o), id);
  }
  get(id: string, fallback: any = {}) {
    const r = this.db
      .prepare("SELECT body FROM settings WHERE id=?")
      .get(id) as any;
    return r ? this.decode(r.body) : fallback;
  }
  set(id: string, body: any) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES (?,?)")
      .run(id, this.encode(body));
  }
  packet(body: any) {
    this.db
      .prepare("INSERT INTO packets(created,body) VALUES (?,?)")
      .run(new Date().toISOString(), this.encode(body));
  }
}
