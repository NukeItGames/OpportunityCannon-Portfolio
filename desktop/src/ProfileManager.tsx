import { DiscoveryPreferences } from "./DiscoveryPreferences";
import { eligibilityFields } from "../electron/eligibility";
import { EligibilitySettings } from "./EligibilitySettings";
import React, { useState } from "react";
const fields: any = {
  shared: [
    "name",
    "firstName",
    "lastName",
    "email",
    "phone",
    "address",
    "linkedin",
    "website",
  ],
  job: [
    "jobTitleKeywords",
    "skills",
    "workHistory",
    "education",
    "salaryExpectations",
    "portfolio",
    "preferences",
    "resume",
    "resumeText",
  ],
  vc: [
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
  ],
};
const labels: Record<string, string> = {
  targetLocation: "Target job location (blank for any location)",
  jobTitleKeywords: "Job title keywords (comma separated; blank for all roles)",
  productKeywords: "Startup sector keywords (comma separated)",
  stageKeywords: "Funding stage keywords (comma separated)",
  targetRegion: "Preferred funding region (blank for no regional preference)",
  excludedDomains: "Excluded investor domains (comma or newline separated)",
  firstName: "First name",
  lastName: "Last name",
  salaryExpectations: "Salary expectations",
  portfolio: "Portfolio",
  founderBackground: "Founder background",
  name: "Full name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  linkedin: "LinkedIn",
  website: "Personal website",
  skills: "Skills",
  workHistory: "Work experience",
  education: "Education",
  preferences: "Job preferences",
  resume: "Resume file",
  resumeText: "Resume text",
  company: "Startup name",
  companyWebsite: "Startup website",
  description: "Startup description",
  progress: "Product progress",
  traction: "Traction",
  businessModel: "Business model",
  fundingGoals: "Funding goals",
  legalStructure: "Legal structure",
  deck: "Pitch deck file",
};
function ReadablePreview({ value }: { value: any }) {
  if (value === null || value === undefined) return <span>Not provided</span>;
  if (Array.isArray(value)) return <ul>{value.map((item, i) => <li key={i}><ReadablePreview value={item} /></li>)}</ul>;
  if (typeof value === "object") return <dl>{Object.entries(value).map(([key, item]) => {
    const text = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
    const label = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    return <React.Fragment key={key}><dt>{label}</dt><dd><ReadablePreview value={item} /></dd></React.Fragment>;
  })}</dl>;
  return <span>{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value) || "Not provided"}</span>;
}
const titles = [
  "Shared personal and contact information",
  "Job Search profile",
  "VC Funding profile",
  "Review, save, and browser integration",
];
export function ProfileManager({
  initial,
  first,
  onSaved,
}: {
  initial: any;
  first: boolean;
  onSaved: () => void;
}) {
  const [hasLegacy, setHasLegacy] = useState(initial.legacy.length > 0);
  const [p, setP] = useState(initial.profiles),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [password, setPassword] = useState(""),
    [preview, setPreview] = useState<any>(),
    [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch {
      setError(
        "Operation failed. Check the selected file, password and profile values. No existing data was replaced.",
      );
    } finally {
      setBusy(false);
    }
  }
  const section = ["shared", "job", "vc"][step];
  function change(k: string, v: any) {
    setP({ ...p, [section]: { ...p[section], [k]: v } });
    setNotice("Unsaved changes");
  }
  const custom = p[section]?.customAnswers || [];
  return (
    <section className="panel profile-manager">
      <h1>{first ? "Set up Opportunity Cannon" : "Profile editor"}</h1>
      <p>
        Store your verified information on this Windows account. Blank means
        unknown. All profile fields are optional. Skip any workspace you do not
        use. You review and submit every application.
      </p>
      <nav className="buttons">
        {titles.map((t, i) => (
          <button
            key={t}
            aria-current={step === i ? "step" : undefined}
            onClick={() => setStep(i)}
          >
            {i + 1}. {t}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {hasLegacy && (
        <details>
          <summary>Existing local profiles detected - preview import</summary>
          <p>
            Original profiles and application history are retained. Review both
            contacts below; choose the shared contact details you want.
            Importing fills this editor only until you save.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const legacy = await window.cannon.call("legacyPreview");
                setPreview({ legacy });
              })
            }
          >
            Preview existing profiles
          </button>
          {preview?.legacy && (
            <>
              <ReadablePreview value={preview.legacy} />
              <button
                onClick={() => {
                  setP(preview.legacy.profiles);
                  setPreview(undefined);
                  setNotice("Imported into editor. Review before saving.");
                }}
              >
                Use preview in editor
              </button>
            </>
          )}
        </details>
      )}
      <h2>{titles[step]}</h2>
      {section && section !== "shared" && (
        <label>
          <input
            type="checkbox"
            checked={p[section].enabled !== false}
            onChange={(e) => change("enabled", e.target.checked)}
          />
          Set up {section === "job" ? "Job Search" : "VC Funding"} (optional)
        </label>
      )}
      {section ? (
        <>
          {(section === "shared" || p[section].enabled !== false) && (
            <>
              <div className="form">
                {fields[section].map((k: string) => (
                  <label key={k}>
                    {labels[k] || k} (optional)
                    <textarea
                      aria-label={k}
                      value={p[section][k] || ""}
                      onChange={(e) => change(k, e.target.value)}
                    />
                    {["resume", "deck"].includes(k) && (
                      <>
                        <button
                          onClick={() =>
                            run(async () => {
                              const path = await window.cannon.call("file");
                              if (path) change(k, path);
                            })
                          }
                        >
                          Choose local file
                        </button>
                        <small>
                          {" "}
                          File reference only. Copy the document separately when
                          moving computers; uploads remain manual.
                        </small>
                      </>
                    )}
                  </label>
                ))}
              </div>
              {section !== "shared" && (
                <>
                  <label>
                    Sources per search
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={p[section].limit}
                      onChange={(e) => change("limit", +e.target.value)}
                    />
                  </label>
                  <DiscoveryPreferences
                    mode={section}
                    p={p[section]}
                    onChange={(value) => {
                      setP({ ...p, [section]: value });
                      setNotice("Unsaved search preferences");
                    }}
                  />
                  <EligibilitySettings
                    key={section}
                    mode={section}
                    profile={p[section]}
                    onChange={(value) => {
                      setP({ ...p, [section]: value });
                      setNotice("Unsaved eligibility changes");
                    }}
                  />
                  <h2>Custom application answers</h2>
                  <p>
                    Each answer belongs to this workspace and an exact
                    application URL. A blank URL keeps the answer stored but
                    excludes it from OPEN & FILL. Terms and consent always
                    remain manual.
                  </p>
                  {custom.map((a: any, i: number) => (
                    <div className="answer" key={i}>
                      {["label", "value", "url"].map((k) => (
                        <label key={k}>
                          {k === "label"
                            ? "Exact question"
                            : k === "url"
                              ? "Exact HTTPS application URL"
                              : "Verified answer"}
                          <textarea
                            aria-label={`${k} ${i + 1}`}
                            value={a[k] || ""}
                            onChange={(e) =>
                              change(
                                "customAnswers",
                                custom.map((x: any, j: number) =>
                                  j === i ? { ...x, [k]: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <select
                        aria-label={`Answer type ${i + 1}`}
                        value={a.type}
                        onChange={(e) =>
                          change(
                            "customAnswers",
                            custom.map((x: any, j: number) =>
                              j === i ? { ...x, type: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="text">Text or dropdown</option>
                        <option value="checkbox">Checkbox (true or false)</option>
                      </select>
                      <button
                        onClick={() =>
                          change(
                            "customAnswers",
                            custom.filter((_: any, j: number) => j !== i),
                          )
                        }
                      >
                        Remove answer
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      change("customAnswers", [
                        ...custom,
                        { label: "", value: "", url: "", type: "text" },
                      ])
                    }
                  >
                    Add custom answer
                  </button>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <p>
            Review your information below. Saving stores all three sections
            locally with Windows account protection. You can edit or remove
            answers anytime in Settings.
          </p>
          {["shared", "job", "vc"].map((section, i) => (
            <section key={section}>
              <h3>{titles[i]}</h3>
              {section !== "shared" && p[section].enabled === false && (
                <p>
                  Skipped. Saved values are retained and excluded from answer
                  packets.
                </p>
              )}
              {fields[section].map((k: string) => (
                <p key={k}>
                  <b>{labels[k] || k}:</b> {p[section][k] || "Not provided"}
                </p>
              ))}
              {section !== "shared" &&
                Object.entries(eligibilityFields[section]).map(([k, label]) => (
                  <p key={k}>
                    <b>{label}:</b> {p[section][k] || "Not provided"}
                  </p>
                ))}
              {(p[section].customAnswers || []).map((a: any, j: number) => (
                <p key={j}>
                  <b>{a.label || "Unlabeled answer"}:</b>{" "}
                  {a.value || "Not provided"}
                  <br />
                  <small>{a.url || "Manual use only"}</small>
                </p>
              ))}
            </section>
          ))}
          <h2>Browser integration setup</h2>
          <p>
            Open the extension folder. In Chrome or Edge, open Extensions,
            enable Developer mode and choose Load unpacked. Select that folder.
            Enable HTTPS access and reconnect in the extension popup. OPEN &
            FILL delivers answers automatically. Review every answer and
            personally submit.
          </p>
          <button
            onClick={() =>
              run(async () => {
                await window.cannon.call("extension");
              })
            }
          >
            Open extension folder
          </button>
          <p>
            Optional Google and AI credentials can be configured in Settings
            after setup.
          </p>
        </>
      )}
      <div className="buttons">
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </button>
        {step < 3 ? (
          <button onClick={() => setStep(step + 1)}>Next</button>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await window.cannon.call("profilesSave", p);
                setNotice("Profiles saved locally");
                onSaved();
              })
            }
          >
            {first ? "Save and finish setup" : "Save all profiles"}
          </button>
        )}
      </div>
      {!first && (
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await window.cannon.call("profilesSave", p);
              for (const mode of ["job", "vc"])
                if (p[mode].enabled !== false)
                  await window.cannon.call("search", mode);
              const results = await Promise.all(
                ["job", "vc"].map((mode) => window.cannon.call("state", mode)),
              );
              setNotice(
                results
                  .map(
                    (s, i) =>
                      `${i === 0 ? "Jobs" : "VC"}: ${s.items.filter((o: any) => o.classification === "Strong Match").length} Strong Matches; ${s.items.filter((o: any) => o.classification === "Golden Ticket").length} Golden Tickets`,
                  )
                  .join(" | "),
              );
              onSaved();
            })
          }
        >
          Save profiles and rerun enabled searches
        </button>
      )}
      <details>
        <summary>Encrypted backup and safe import</summary>
        <p>
          Exports include profiles, searches, research and application history.
          Credentials are excluded; reconnect integrations on the new computer.
          Use a password of at least 12 characters. Losing it makes the backup
          unrecoverable. Preview record counts before importing; existing records
          win.
        </p>
        <label>
          Backup password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (await window.cannon.call("backupExport", password)) {
                setPassword("");
                setNotice("Encrypted backup saved");
              }
            })
          }
        >
          Export encrypted backup
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              setPreview(await window.cannon.call("backupPreview", password));
              setPassword("");
            })
          }
        >
          Preview backup or legacy database
        </button>
        {preview && !preview.legacy && (
          <>
            <div className="import-preview"><ReadablePreview value={preview} /></div>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await window.cannon.call("backupMerge");
                  setPreview(undefined);
                  const s = await window.cannon.call("profiles");
                  setP(s.profiles);
                  setHasLegacy(s.legacy.length > 0);
                  setNotice("Merged safely. Existing records retained.");
                })
              }
            >
              Merge previewed data
            </button>
          </>
        )}
      </details>
    </section>
  );
}
