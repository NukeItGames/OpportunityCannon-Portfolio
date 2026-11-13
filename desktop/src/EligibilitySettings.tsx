import React, { useState, useEffect } from "react";
import {
  eligibilityFields,
  displayFact,
  eligibilityQuestions,
  reusedFields,
  profileSnapshot,
  numericPolicy,
} from "../electron/eligibility";
export function EligibilitySettings({
  mode,
  profile,
  onChange,
}: {
  mode: string;
  profile: any;
  onChange: (v: any) => void;
}) {
  const [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    window.cannon
      .call("state", mode)
      .then((s) => setItems(s.items))
      .catch(() => setError("Could not load saved opportunities."));
    setSelected("");
  }, [mode]);
  const cfg = JSON.parse(profile.discoveryPolicy || "{}");
  const setCfg = (v: any) =>
    onChange({ ...profile, discoveryPolicy: JSON.stringify(v) });
  const item = items.find((x) => x.url === selected),
    review = cfg.reviews?.[selected] || {};
  const updateReview = (v: any) =>
    setCfg({
      ...cfg,
      reviews: {
        ...cfg.reviews,
        [selected]: {
          ...review,
          ...v,
          checked: undefined,
          profileSnapshot: undefined,
        },
      },
    });
  const confirmed = cfg.confirmedProfile === profileSnapshot(profile, mode);
  const [attest, setAttest] = useState(false);
  useEffect(() => setAttest(false), [selected, profile]);
  return (
    <section>
      <h2>Eligibility and discovery review</h2>
      <p>
        Blank means unknown, not disqualified. Existing onboarding answers below
        are reused. Confirm facts only when accurate; no answer is inferred from
        a keyword.
      </p>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Existing onboarding facts used for eligibility</summary>
        {reusedFields[mode].map((k) => (
          <p key={k}>
            <b>{k}:</b> {displayFact(profile[k])}
          </p>
        ))}
      </details>
      {Object.entries(eligibilityFields[mode]).map(([k, label]) => (
        <label key={k}>
          {label}
          <textarea
            aria-label={k}
            value={profile[k] || ""}
            onChange={(e) => onChange({ ...profile, [k]: e.target.value })}
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) =>
            setCfg({
              ...cfg,
              confirmedProfile: e.target.checked
                ? profileSnapshot(profile, mode)
                : undefined,
            })
          }
        />
        I reviewed the supplied profile facts; blank answers remain unknown
      </label>
      <h3>Review an opportunity's requirements</h3>
      <button
        onClick={() =>
          window.cannon
            .call("state", mode)
            .then((s) => setItems(s.items))
            .catch(() => setError("Could not refresh opportunities."))
        }
      >
        Refresh saved opportunities
      </button>
      <p>
        Run discovery first to populate this list. Read the full requirements
        and compare them with your profile. A profile confirmation alone does
        not establish eligibility for every opportunity.
      </p>
      <label>
        Opportunity to review
        <select
          aria-label="Opportunity to review"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose an opportunity</option>
          {items.map((x) => (
            <option key={x.id} value={x.url}>
              {x.name} - {x.company}
            </option>
          ))}
        </select>
      </label>
      {item && (
        <div>
          <p>Official source: {item.url}</p>
          <h4>Profile facts prompted by this source</h4>
          <p>
            Check applicability in the full requirements; some references may be
            preferences rather than mandatory conditions.
          </p>
          {eligibilityQuestions(
            profile,
            mode,
            item.eligibilitySource || item.details,
          ).map((q) => (
            <p key={q.field}>
              {q.label}:{" "}
              {q.known
                ? "Existing answer available - review it above"
                : "Missing answer"}
            </p>
          ))}
          <p>Current blockers: {(item.reasons || []).join("; ")}</p>
          <details open>
            <summary>Published requirements and source evidence</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {item.eligibilitySource || item.details}
            </pre>
          </details>
          {item.discovery && (
            <>
              <p>
                Discovered through {item.discovery.provider}:{" "}
                {item.discovery.resultUrl}. Search query: {item.discovery.query}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={review.officialSource === true}
                  onChange={(e) =>
                    updateReview({ officialSource: e.target.checked })
                  }
                />
                I verified this source belongs to the organization and is its
                official opportunity
              </label>
            </>
          )}
          <label>
            Eligibility decision
            <select
              aria-label="Eligibility decision"
              value={
                review.eligible === true
                  ? "yes"
                  : review.eligible === false
                    ? "no"
                    : "unknown"
              }
              onChange={(e) =>
                updateReview({
                  eligible:
                    e.target.value === "unknown"
                      ? undefined
                      : e.target.value === "yes",
                })
              }
            >
              <option value="unknown">
                Missing information - not yet determined
              </option>
              <option value="yes">I meet all mandatory requirements</option>
              <option value="no">I do not meet a mandatory requirement</option>
            </select>
          </label>
          <label>
            Qualification comparison or missing facts
            <textarea
              aria-label="Qualification comparison"
              value={review.rationale || ""}
              onChange={(e) => updateReview({ rationale: e.target.value })}
            />
          </label>
          <label>
            Application deadline (if published)
            <input
              aria-label="Application deadline"
              type="date"
              value={review.deadline || ""}
              onChange={(e) => updateReview({ deadline: e.target.value })}
            />
          </label>
          {mode === "job" ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={review.exceptionalCareer === true}
                  onChange={(e) =>
                    updateReview({ exceptionalCareer: e.target.checked })
                  }
                />
                Exceptional career opportunity, with evidence
              </label>
              <label>
                Exceptional career evidence
                <textarea
                  value={review.careerReason || ""}
                  onChange={(e) =>
                    updateReview({ careerReason: e.target.value })
                  }
                />
              </label>
            </>
          ) : (
            <details>
              <summary>
                Verified funding terms (optional for Strong Match)
              </summary>
              {[
                "sourceUrl",
                "quote",
                "currency",
                "guaranteedCash",
                "maxTotalEquity",
                "rationale",
              ].map((k) => (
                <label key={k}>
                  {
                    (
                      {
                        sourceUrl: "Official terms URL",
                        quote: "Exact official terms quotation",
                        currency:
                          "Currency (must match your configured threshold currency)",
                        guaranteedCash:
                          "Guaranteed cash, excluding conditional follow-on",
                        maxTotalEquity:
                          "Maximum total equity including all instruments (%)",
                        rationale: "Terms / accelerator assessment rationale",
                      } as any
                    )[k]
                  }
                  <textarea
                    aria-label={"terms " + k}
                    value={review.terms?.[k] ?? ""}
                    onChange={(e) =>
                      updateReview({
                        terms: {
                          ...review.terms,
                          [k]: ["guaranteedCash", "maxTotalEquity"].includes(k)
                            ? e.target.value === ""
                              ? undefined
                              : Number(e.target.value)
                            : e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
              {Object.entries({
                official: "I verified this is an official source",
                complete: "I reviewed all terms, conditions, fees and dilution",
                nonDilutive: "Non-dilutive (total equity must be zero)",
                founderFriendly:
                  "Founder-friendly terms with supporting rationale",
                exceptionalAccelerator:
                  "Exceptional accelerator with supporting rationale",
              }).map(([k, label]) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={review.terms?.[k] === true}
                    onChange={(e) =>
                      updateReview({
                        terms: { ...review.terms, [k]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </details>
          )}
          <label>
            <input
              aria-label="Confirm requirements review"
              type="checkbox"
              checked={attest}
              onChange={(e) => setAttest(e.target.checked)}
            />
            I read the full official requirements, compared every mandatory
            condition with my facts, and recorded any gaps above
          </label>
          <button
            disabled={
              !confirmed ||
              !attest ||
              !item.eligibilitySource ||
              (review.rationale || "").trim().length < 20
            }
            onClick={() => {
              setCfg({
                ...cfg,
                reviews: {
                  ...cfg.reviews,
                  [selected]: {
                    ...review,
                    checked: new Date().toISOString(),
                    profileSnapshot: profileSnapshot(profile, mode),
                    sourceSnapshot: item.eligibilitySource,
                    evidence: [
                      {
                        url: selected,
                        quote: item.eligibilitySource.slice(0, 500),
                      },
                    ],
                  },
                },
              });
              setError(
                "Review recorded in editor. Save profiles and rerun discovery to verify current source and intake.",
              );
            }}
          >
            Confirm opportunity review
          </button>
          <p>
            {review.checked
              ? "Confirmed " + review.checked
              : "Unconfirmed review; no promotion until confirmed and rerun."}
          </p>
        </div>
      )}
      <details>
        <summary>Discovery thresholds and exclusions</summary>
        <p>
          Exceptional-value criteria are disabled until you configure them. No
          universal amount, currency or equity threshold is assumed.
        </p>
        {mode === "vc" && (
          <label>
            Threshold currency (ISO code)
            <input
              aria-label="fundingCurrency"
              value={cfg.fundingCurrency || ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  fundingCurrency: e.target.value.toUpperCase(),
                })
              }
            />
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={
              cfg[
                mode === "job"
                  ? "allowExceptionalCareer"
                  : "allowExceptionalAccelerator"
              ] === true
            }
            onChange={(e) =>
              setCfg({
                ...cfg,
                [mode === "job"
                  ? "allowExceptionalCareer"
                  : "allowExceptionalAccelerator"]: e.target.checked,
              })
            }
          />
          Allow reviewed exceptional{" "}
          {mode === "job" ? "career opportunities" : "accelerators"} to qualify
          as Golden Tickets
        </label>
        {mode === "vc" && (
          <label>
            <input
              type="checkbox"
              checked={cfg.preferPreRevenue === true}
              onChange={(e) =>
                setCfg({ ...cfg, preferPreRevenue: e.target.checked })
              }
            />
            Prefer investors accepting pre-revenue companies
          </label>
        )}
        {Object.entries(numericPolicy)
          .filter(
            ([k]) =>
              mode === "vc" ||
              ["maxEvidenceDays", "maxRequiredYears", "sourceOffset"].includes(
                k,
              ),
          )
          .map(([k, [label, def]]) => (
            <label key={k}>
              {label}
              <input
                type="number"
                min="0"
                aria-label={k}
                placeholder={
                  k === "maxRequiredYears" ? "No limit" : String(def)
                }
                value={cfg[k] ?? ""}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    [k]:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        {["excludedTitles", "excludedOpportunities"].map((k) => (
          <label key={k}>
            {k === "excludedTitles"
              ? "Excluded job titles"
              : "Excluded or previously applied opportunities (names or URLs)"}
            <textarea
              value={cfg[k] || ""}
              onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}
            />
          </label>
        ))}
      </details>
    </section>
  );
}
