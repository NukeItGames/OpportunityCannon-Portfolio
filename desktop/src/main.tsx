import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { ProfileManager } from "./ProfileManager";
import { Integrations } from "./Integrations";
declare global {
  interface Window {
    cannon: {
      call: (name: string, ...args: any[]) => Promise<any>;
      progress: (fn: (s: string) => void) => () => void;
    };
  }
}
const api = window.cannon;
function App() {
  const [onboarding, setOnboarding] = useState<any>();
  useEffect(() => {
    api
      .call("profiles")
      .then(setOnboarding)
      .catch(() => setOnboarding({ failed: true }));
  }, []);

  const [mode, setMode] = useState<"vc" | "job" | null>(null);
  const [state, setState] = useState<any>(),
    [page, setPage] = useState("opportunities"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [ranking, setRanking] = useState("matches"),
    [status, setStatus] = useState("all"),
    [busy, setBusy] = useState(false),
    [log, setLog] = useState<string[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<any>(),
    [history, setHistory] = useState<any[]>([]),
    [profile, setProfile] = useState<any>(),
    [importUrl, setImportUrl] = useState(""),
    [importName, setImportName] = useState("");
  const detailsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = detailsRef.current;
    if (!modal) return;
    const controls = () => Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'));
    controls()[0]?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setSelected(null); }
      if (event.key === "Tab") {
        const list = controls(), first = list[0], last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    modal.addEventListener("keydown", keyboard);
    return () => { modal.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [selected?.id]);
  async function refresh() {
    if (!mode) return;
    const s = await api.call("state", mode);
    setState(s);
    setLog(s.log);
    if (!profile) setProfile(s.settings);
  }
  async function run(fn: () => Promise<any>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    refresh();
    return api.progress((s) => setLog((v) => [...v, s]));
  }, [mode]);
  async function find(kind: string) {
    setBusy(true);
    setLog([]);
    await run(() => api.call("search", kind));
    setBusy(false);
  }
  if (!onboarding) return <main>Loading local profiles...</main>;
  if (onboarding.failed)
    return (
      <main role="alert">
        Unable to unlock local profiles on this Windows account.
      </main>
    );
  if (!onboarding.complete)
    return (
      <div className="setup">
        <img className="brand" src="./logo.png" alt="Opportunity Cannon" />
        <ProfileManager
          initial={onboarding}
          first={true}
          onSaved={() => api.call("profiles").then(setOnboarding)}
        />
      </div>
    );
  if (!mode)
    return (
      <div className="launch">
        <img className="brand" src="./logo.png" alt="Opportunity Cannon" />
        <p className="eyebrow">OPPORTUNITY CANNON</p>
        <h1>Choose your next chapter.</h1>
        <p>Two focused workspaces. One place to move forward.</p>
        <div className="modeChoices">
          <button onClick={() => setMode("vc")}>
            <h2>VC FUNDING</h2>
            <p>Find backing for your startup.</p>
            <small>Business profile / Investor applications</small>
          </button>
          <button onClick={() => setMode("job")}>
            <h2>JOB SEARCH</h2>
            <p>Find your next role.</p>
            <small>Personal profile / Employment applications</small>
          </button>
        </div>
        <p className="muted">You review and submit every application.</p>
      </div>
    );
  if (!state || !profile) return <main>Loading local workspace…</main>;
  const items = state.items.filter(
    (x: any) =>
      (status === "all" || x.status === status) &&
      (ranking === "all" ||
        (ranking === "matches"
          ? x.classification &&
            x.classification !== "Filtered Out" &&
            Date.now() - Date.parse(x.checked) <= 7 * 86400000
          : (x.classification || "Filtered Out") === ranking)) &&
      `${x.name} ${x.company} ${x.details}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <aside>
        <img className="brand" src="./logo.png" alt="Opportunity Cannon" />
        <h2>Opportunity Cannon</h2>
        <p>{mode === "vc" ? "VC FUNDING" : "JOB SEARCH"}</p>
        <button
          onClick={() => {
            setMode(null);
            setState(undefined);
            setProfile(undefined);
            setQuery("");
            setStatus("all");
            setSelected(undefined);
            setPage("opportunities");
          }}
          disabled={busy}
        >
          Switch mode
        </button>
        <button onClick={() => setPage("opportunities")}>Opportunities</button>
        <button onClick={() => setPage("profile")}>Profiles & settings</button>
        <button onClick={() => run(() => api.call("tracker"))}>
          Open master tracker ↗
        </button>
        <div className="asideFoot">
          LOCAL FIRST
          <br />
          You review. You submit.
          <br />
          <small>No automatic submissions.</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER</p>
            <h1>
              {page === "profile"
                ? "Profiles & settings"
                : mode === "vc"
                  ? "Funding for your startup."
                  : "Your next role."}
            </h1>
            <p className="muted">
              {mode === "vc"
                ? "Funding leads for review; official identity, intake and eligibility need verification."
                : "Job leads for review; intake and personal eligibility need verification."}
            </p>
          </div>
          <span className="badge">Offline storage · SQLite</span>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {page === "opportunities" ? (
          <>
            <div className="actions">
              <button disabled={busy} onClick={() => find(mode)}>
                {mode === "vc" ? "FIND VC FUNDING" : "FIND JOBS"}
              </button>
            </div>
            <div className="stats">
              <section>
                <strong>{state.items.length}</strong>
                <span>Screened records (including filtered)</span>
              </section>
              <section>
                <strong>
                  {
                    state.items.filter((x: any) => x.status === "Applied")
                      .length
                  }
                </strong>
                <span>Personally marked applied</span>
              </section>
              <section>
                <strong>{busy ? "Searching…" : "Ready"}</strong>
                <span>
                  Last searched:{" "}
                  {state.last === "Never"
                    ? "Never"
                    : new Date(state.last).toLocaleString()}
                </span>
              </section>
            </div>
            <p className="muted" aria-label="Screening totals">
              Qualified:{" "}
              {
                state.items.filter((x: any) =>
                  ["Golden Ticket", "Strong Match"].includes(x.classification),
                ).length
              }
              {" \u00b7 "}Pending:{" "}
              {
                state.items.filter(
                  (x: any) => x.classification === "Requires Verification",
                ).length
              }
              {" \u00b7 "}Filtered:{" "}
              {
                state.items.filter(
                  (x: any) => x.classification === "Filtered Out",
                ).length
              }
            </p>
            <details open={busy}>
              <summary>Search progress & source reports ({log.length})</summary>
              <pre>
                {log.join("\n") ||
                  "Press a search button to check configured official sources. No paid API required."}
              </pre>
            </details>
            <div className="toolbar">
              <label>
                Quality{" "}
                <select
                  value={ranking}
                  onChange={(e) => setRanking(e.target.value)}
                >
                  <option value="matches">
                    Matches and pending verification
                  </option>
                  <option>Golden Ticket</option>
                  <option>Strong Match</option>
                  <option>Requires Verification</option>
                  <option>Filtered Out</option>
                  <option value="all">All research records</option>
                </select>
              </label>
              <input
                aria-label="Search opportunities"
                placeholder="Search opportunities, companies, requirements…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="Application status filter"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {["all", "New", "Saved", "Skipped", "Applied", "Rejected"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </div>
            <p className="muted">
              Scores are provisional. Reachable pages do not prove eligibility
              or open intake.{" "}
              {mode === "vc"
                ? "Previously applied records and your excluded domains are blocked."
                : "Complete your skills and experience profile to improve matching."}
            </p>
            <div className="results">
              {items.map((x: any) => (
                <article key={x.id}>
                  <div className="cardTop">
                    <span className="tag">
                      {x.kind === "vc" ? "FUNDING" : "JOB"}
                    </span>
                    <span>
                      {x.status} · {x.classification || "Filtered Out"}
                      {x.classification === "Requires Verification" ? (
                        <span>
                          {" "}
                          · Review priority {x.reviewPriority || 0}/100 (not
                          verified eligibility)
                        </span>
                      ) : (
                        <b> · {x.score}/100</b>
                      )}
                    </span>
                  </div>
                  <h2>{x.name}</h2>
                  <p>
                    {x.company}
                    {x.location ? " · " + x.location : ""}
                  </p>
                  {x.salary && (
                    <p>
                      {x.salary} · {x.mode}
                    </p>
                  )}
                  <p className="verification">{x.verification}</p>
                  <p>
                    <b>
                      Eligibility: {x.eligibilityState || "Missing information"}
                    </b>
                  </p>
                  <p>
                    {(
                      x.reasons || [
                        "Legacy record: rerun discovery for verification",
                      ]
                    ).join("; ")}
                  </p>
                  {(x.evidence || []).map((e: any, i: number) => (
                    <p key={i}>
                      Source: {e.url} - {e.quote}
                    </p>
                  ))}
                  <small>Checked {new Date(x.checked).toLocaleString()}</small>
                  <div className="buttons">
                    <button
                      onClick={() => {
                        setSelected(x);
                        api.call("history", x.id).then(setHistory);
                      }}
                    >
                      Review details
                    </button>
                    <button
                      disabled={
                        x.verification === "EMAIL ONLY" ||
                        ["Applied", "Rejected"].includes(x.status)
                      }
                      onClick={() => run(() => api.call("open", x.id, false))}
                    >
                      OPEN APPLICATION
                    </button>
                    <button
                      disabled={
                        x.verification === "EMAIL ONLY" ||
                        ["Applied", "Rejected"].includes(x.status)
                      }
                      onClick={() => run(() => api.call("open", x.id, true))}
                    >
                      OPEN & FILL
                    </button>
                    {["Saved", "Skipped", "Applied", "Rejected"].map((s, i) => (
                      <button
                        key={s}
                        onClick={() => {
                          if (
                            s !== "Applied" ||
                            confirm(
                              "Confirm that you personally submitted this application?",
                            )
                          ) {
                            const reopen =
                              ["Applied", "Rejected"].includes(x.status) &&
                              !["Applied", "Rejected"].includes(s);
                            if (
                              !reopen ||
                              confirm(
                                "Reopen this previously applied/rejected opportunity? Review its history before applying again.",
                              )
                            )
                              run(() => api.call("status", x.id, s, reopen));
                          }
                        }}
                      >
                        {["SAVE", "SKIP", "MARK APPLIED", "MARK REJECTED"][i]}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {!items.length && (
              <div className="empty">
                <h2>Your next opportunity starts here.</h2>
                <p>
                  Search live sources or import an official application URL
                  below.
                </p>
              </div>
            )}
            <details>
              <summary>Import an application URL</summary>
              <input
                aria-label="Company or opportunity name"
                placeholder="Company or opportunity name"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
              />
              <input
                aria-label="Official application URL"
                placeholder="https://official-application-url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
              <button
                onClick={() =>
                  run(() => api.call("import", importUrl, importName, mode))
                }
              >
                Verify and import
              </button>
            </details>
          </>
        ) : (
          <>
            <ProfileManager
              key={mode}
              initial={onboarding}
              first={false}
              onSaved={() => {
                api.call("profiles").then(setOnboarding);
                refresh();
              }}
            />
            <section className="panel">
              <h2>Browser-assisted filling</h2>
              <p>
                OPEN & FILL queues a short-lived task and opens the official
                page in your default Chrome or Edge browser. Enable the
                extension first. Answers arrive automatically. Review its status
                panel and personally submit.
              </p>
              <button onClick={() => run(() => api.call("extension"))}>
                Open extension folder
              </button>
              <p>
                Verify or repair browser integration in Connections. Files,
                frames, custom widgets, login and CAPTCHA remain manual.
              </p>
              <p>
                Browser: Windows default HTTPS handler. Change it in Windows
                Settings.
              </p>
              <small>Local data: {state.dataPath}</small>
            </section>
            <Integrations key={mode} mode={mode} />
          </>
        )}
        {selected && (
          <div className="overlay">
            <section className="modal" ref={detailsRef} role="dialog" aria-modal="true" aria-labelledby="opportunity-details-title">
              <button onClick={() => setSelected(null)}>Close details</button>
              <h2 id="opportunity-details-title">{selected.name}</h2>
              <p>{selected.url}</p>
              <pre>{selected.details}</pre>
              <label>
                Notes
                <textarea
                  value={selected.notes || ""}
                  onChange={(e) =>
                    setSelected({ ...selected, notes: e.target.value })
                  }
                />
              </label>
              <label>
                Follow-up date
                <input
                  type="date"
                  value={selected.followUp || ""}
                  onChange={(e) =>
                    setSelected({ ...selected, followUp: e.target.value })
                  }
                />
              </label>
              <button
                onClick={() =>
                  run(() =>
                    api.call(
                      "notes",
                      selected.id,
                      selected.notes || "",
                      selected.followUp || "",
                    ),
                  )
                }
              >
                Save notes
              </button>
              <h2>Application history</h2>
              {history.map((h, i) => (
                <p key={i}>
                  {new Date(h.changed).toLocaleString()}{" \u00b7 "}{h.status}
                </p>
              ))}
              <button
                onClick={() => run(() => api.call("open", selected.id, false))}
              >
                OPEN APPLICATION
              </button>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
