const status = document.getElementById("status");
async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const d = await chrome.storage.session.get(null);
  status.textContent = d.connection || "Open desktop and reconnect.";
  document.getElementById("fields").replaceChildren();
  const r = d["report-" + tab.id];
  if (r) {
    status.textContent += "\n" + (r.notice || r.error);
    for (const f of r.fields || []) {
      const li = document.createElement("li");
      li.textContent = f.label + ": " + f.status;
      if (!["filled", "preserved"].includes(f.status)) {
        const b = document.createElement("button");
        b.textContent = "Retry";
        b.onclick = () => run({ op: "retry", only: f.index });
        li.append(b);
      }
      document.getElementById("fields").append(li);
    }
  }
}
async function run(m) {
  const r = await chrome.runtime.sendMessage(m);
  if (r?.error) status.textContent = r.error;
  else await refresh();
}
document.getElementById("connect").onclick = async () => {
  if (await chrome.permissions.request({ origins: ["https://*/*"] }))
    await run({ op: "connect" });
};
document.getElementById("retry").onclick = () => run({ op: "retry" });
refresh();
