import React, { useEffect, useState } from "react";
export function Integrations({ mode }: { mode: "vc" | "job" }) {
  const [c, setC] = useState<any>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [question, setQuestion] = useState(""),
    [facts, setFacts] = useState(""),
    [draft, setDraft] = useState("");
  const api = window.cannon;
  async function action(fn: () => Promise<any>) {
    setBusy(true);
    try {
      const r = await fn();
      setMessage(typeof r === "object" ? JSON.stringify(r, null, 2) : "Done");
      setC({
        ...(await api.call("integrationStatus")),
        aiKey: "",
        googleClientSecret: "",
      });
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api.call("integrationStatus").then(setC);
  }, []);
  return (
    <section className="panel">
      <h2>Browser integration</h2>
      <p>
        Load the included extension using Chrome or Edge Extensions, Developer
        mode, Load unpacked. Enable HTTPS access in its popup. Set that browser
        as your Windows default. Keep this app running. Chrome requires manual
        Load unpacked installation; command-line extension loading is not a
        setup method. Registration repair alone does not install the extension.
      </p>
      <button onClick={() => action(() => api.call("extension"))}>
        Open included extension folder
      </button>
      <button onClick={() => action(() => api.call("browserStatus"))}>
        Verify browser connection
      </button>
      <button onClick={() => action(() => api.call("browserRepair"))}>
        Repair registration / reconnect
      </button>
      <h2>Optional connections</h2>
      <p>
        These are off until you configure them. Search and local tracking need
        no accounts or paid APIs.
      </p>
      <label>
        Master spreadsheet ID
        <input
          value={c.googleSheetId || ""}
          onChange={(e) => setC({ ...c, googleSheetId: e.target.value })}
        />
      </label>
      <label>
        Google Desktop OAuth client ID
        <input
          value={c.googleClientId || ""}
          onChange={(e) => setC({ ...c, googleClientId: e.target.value })}
        />
      </label>
      <label>
        Google client secret (if provided; stored encrypted)
        <input
          type="password"
          autoComplete="off"
          value={c.googleClientSecret || ""}
          onChange={(e) => setC({ ...c, googleClientSecret: e.target.value })}
        />
      </label>
      <label>
        OpenAI API key {c.hasKey ? "(saved)" : ""}
        <input
          type="password"
          autoComplete="off"
          value={c.aiKey || ""}
          onChange={(e) => setC({ ...c, aiKey: e.target.value })}
        />
      </label>
      <label>
        OpenAI model ID (must support structured outputs)
        <input
          value={c.aiModel || ""}
          onChange={(e) => setC({ ...c, aiModel: e.target.value })}
        />
      </label>
      <div className="buttons">
        <button
          disabled={busy}
          onClick={() => action(() => api.call("integrationSave", c))}
        >
          Save connection settings
        </button>
        <button
          disabled={busy}
          onClick={() => action(() => api.call("googleConnect"))}
        >
          Connect Google
        </button>
        <button
          disabled={busy || !c.connected}
          onClick={() => {
            if (
              confirm(
                `Sync ${mode === "vc" ? "funding" : "job"} tracking records to a separate append-only tab in your existing master spreadsheet? This shares opportunity details and statuses, but no profile, resume or pitch files.`,
              )
            )
              action(() => api.call("sync", mode));
          }}
        >
          Sync this mode
        </button>
        <button
          disabled={busy}
          onClick={() => action(() => api.call("googleDisconnect"))}
        >
          Disconnect locally
        </button>
      </div>
      <p>
        Google: {c.connected ? "Connected" : "Not connected"}. Sync creates
        Cannon Desktop VC / Cannon Desktop Jobs tabs. Existing Jobs, VC Funding
        and research history stay intact. Conflicts are reported and preserved
        for manual review. Disconnect removes local credentials; revoke access
        in your Google account if needed.
      </p>
      <pre role="status">
        {busy ? "Working… " : ""}
        {message}
      </pre>
      <h2>AI answer draft · {mode === "vc" ? "VC funding" : "Job search"}</h2>
      <p>
        OpenAI charges API usage based on the chosen model and tokens. Set a
        spending limit in your provider account. Each click below makes one paid
        request, with up to 1,000 output tokens. Only the question and facts you
        enter below are shared; files and profiles are never uploaded
        automatically.
      </p>
      <label>
        Application question
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <label>
        Verified facts you authorize sharing
        <textarea value={facts} onChange={(e) => setFacts(e.target.value)} />
      </label>
      <button
        disabled={busy || !question || !facts}
        onClick={() => {
          if (
            confirm(
              "Send exactly the question and facts shown above to OpenAI? This may incur API charges.",
            )
          )
            action(async () => {
              const r = await api.call("ai", mode, question, facts, true);
              setDraft(JSON.stringify(r, null, 2));
              return "Draft ready. Verify every claim before copying.";
            });
        }}
      >
        Authorize one AI draft
      </button>
      <pre>{draft}</pre>
      {draft && (
        <button onClick={() => api.call("copy", draft)}>
          Copy draft and missing-fact notes
        </button>
      )}
    </section>
  );
}
