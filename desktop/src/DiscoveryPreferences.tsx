import React from "react";
import { locationsFor } from "../electron/preferences";
export function DiscoveryPreferences({
  mode,
  p,
  onChange,
}: {
  mode: string;
  p: any;
  onChange: (v: any) => void;
}) {
  const locations = locationsFor(p),
    sources = mode === "job" ? p.boards || [] : p.fundingSources || [];
  const saveSources = (v: any[]) =>
    onChange({ ...p, [mode === "job" ? "boards" : "fundingSources"]: v });
  return (
    <section>
      <h2>Search preferences and sources</h2>
      {mode === "job" ? (
        <>
          <p>
            Each location row is a complete place. All filled components must
            match; rows are alternatives. Use local names or comma-separated
            aliases within a component. Remote work still requires compatible
            country eligibility. Blank locations mean no geographic filter.
          </p>
          {locations.map((l: any, i: number) => (
            <div key={i}>
              {["city", "region", "country"].map((k) => (
                <label key={k}>
                  {k === "region" ? "State, province, or region" : k === "city" ? "City" : "Country"}
                  <input
                    aria-label={`location ${i + 1} ${k}`}
                    value={l[k] || ""}
                    onChange={(e) =>
                      onChange({
                        ...p,
                        locations: locations.map((x, j) =>
                          j === i ? { ...x, [k]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                onClick={() =>
                  onChange({
                    ...p,
                    locations: locations.filter((_, j) => j !== i),
                  })
                }
              >
                Remove location {i + 1}
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              onChange({
                ...p,
                locations: [
                  ...locations,
                  { city: "", region: "", country: "" },
                ],
              })
            }
          >
            Add target location
          </button>
          <p>Work modes (none selected means any mode)</p>
          {["remote", "hybrid", "onsite"].map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={(p.workModes || []).includes(m)}
                onChange={(e) =>
                  onChange({
                    ...p,
                    workModes: e.target.checked
                      ? [...(p.workModes || []), m]
                      : (p.workModes || []).filter((x: string) => x !== m),
                  })
                }
              />
              {m === "onsite" ? "On-site" : m === "remote" ? "Remote" : "Hybrid"}
            </label>
          ))}
          {Object.entries({
            industries: "Target industries (optional, comma separated)",
            employmentTypes:
              "Employment types (employer wording, e.g. contract or part-time)",
            experienceLevels:
              "Experience levels (optional, use source wording)",
          }).map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                aria-label={k}
                value={p[k] || ""}
                onChange={(e) => onChange({ ...p, [k]: e.target.value })}
              />
            </label>
          ))}
        </>
      ) : (
        <label>
          Eligible startup countries (optional; comma separated names / aliases)
          <input
            aria-label="targetCountries"
            value={p.targetCountries || ""}
            onChange={(e) =>
              onChange({ ...p, targetCountries: e.target.value })
            }
          />
        </label>
      )}
      <h3>Automatic source discovery</h3>
      <label>
        <input
          type="checkbox"
          checked={p.automaticDiscovery !== false}
          onChange={(e) =>
            onChange({ ...p, automaticDiscovery: e.target.checked })
          }
        />
        Automatically find sources when I press Search
      </label>
      <p>
        Search sends only your discovery terms (profession or sector, selected
        locations, industry and stage) to DuckDuckGo's public search page. It
        never sends contact information, resumes, work history, company
        identity, private answers or credentials. Public pages may rate-limit or
        block automation; coverage and official identity are not guaranteed.
      </p>
      <label>
        Search queries per run
        <input
          type="number"
          min="1"
          max="6"
          value={p.discoveryQueryLimit || 4}
          onChange={(e) =>
            onChange({ ...p, discoveryQueryLimit: Number(e.target.value) })
          }
        />
      </label>
      <h3>Optional custom sources</h3>
      <p>
        Automatic discovery works without these. Custom sources supplement
        discovered employer feeds and funding pages. Unsupported providers,
        blocked pages and missing application evidence are reported rather than
        promoted.
      </p>
      {sources.map((s: any, i: number) => (
        <div key={i} className="answer">
          <label>
            Source name
            <input
              aria-label={`source ${i + 1} name`}
              value={s.name || ""}
              onChange={(e) =>
                saveSources(
                  sources.map((x: any, j: number) =>
                    j === i ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          {mode === "job" && (
            <label>
              Provider
              <select
                aria-label={`source ${i + 1} provider`}
                value={s.type}
                onChange={(e) =>
                  saveSources(
                    sources.map((x: any, j: number) =>
                      j === i ? { ...x, type: e.target.value } : x,
                    ),
                  )
                }
              >
                {[
                  "greenhouse",
                  "lever",
                  "ashby",
                  "jobposting",
                  ...(s.type === "jazzhr" ? ["jazzhr"] : []),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {mode === "vc" || s.type === "jobposting"
              ? "Official HTTPS application / opportunity URL"
              : "Employer board identifier"}
            <input
              aria-label={`source ${i + 1} address`}
              value={
                mode === "vc" || s.type === "jobposting"
                  ? s.url || ""
                  : s.board || ""
              }
              onChange={(e) =>
                saveSources(
                  sources.map((x: any, j: number) =>
                    j === i
                      ? {
                          ...x,
                          [mode === "vc" || s.type === "jobposting"
                            ? "url"
                            : "board"]: e.target.value,
                        }
                      : x,
                  ),
                )
              }
            />
          </label>
          {s.type === "jazzhr" && (
            <p>
              Legacy source retained. Select jobposting and enter the official
              job URL to enable this source; no employer-specific URL is
              assumed.
            </p>
          )}
          <button
            onClick={() =>
              saveSources(sources.filter((_: any, j: number) => j !== i))
            }
          >
            Remove source {i + 1}
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          saveSources([
            ...sources,
            mode === "job"
              ? { type: "greenhouse", board: "", name: "" }
              : { name: "", url: "" },
          ])
        }
      >
        Add official source
      </button>
    </section>
  );
}
