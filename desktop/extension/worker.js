let port,
  requests = [],
  running = false;
function connect() {
  if (port) return;
  port = chrome.runtime.connectNative("com.opportunitycannon.bridge");
  port.onMessage.addListener((m) => requests.shift()?.(m));
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    port = null;
    requests.splice(0).forEach((r) =>
      r({
        error: "Host disconnected. Repair registration in desktop Settings.",
      }),
    );
  });
}
function native(m) {
  connect();
  return new Promise((resolve) => {
    requests.push(resolve);
    port.postMessage(m);
  });
}
const exact = (u) => {
  const v = new URL(u);
  v.hash = "";
  for (const k of [...v.searchParams.keys()])
    if (k.startsWith("utm_")) v.searchParams.delete(k);
  return v.href.replace(/\/$/, "");
};
async function fill(tabId, packet, only) {
  if (packet.expires < Date.now())
    throw Error("Task expired; retry from desktop");
  const tab = await chrome.tabs.get(tabId);
  if (exact(tab.url) !== packet.url)
    throw Error("URL changed. Use OPEN & FILL for this exact URL in desktop.");
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["fill.js"],
  });
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (p, one) => {
      const u = new URL(location.href);
      u.hash = "";
      for (const k of [...u.searchParams.keys()])
        if (k.startsWith("utm_")) u.searchParams.delete(k);
      if (u.href.replace(/\/$/, "") !== p.url) return { error: "URL mismatch" };
      return fillVerified(p.fields, one);
    },
    args: [packet, only ?? null],
  });
  await chrome.storage.session.set({ ["report-" + tabId]: results[0]?.result });
  await chrome.action.setBadgeText({ tabId, text: "REVIEW" });
}
async function poll() {
  if (running) return;
  running = true;
  try {
    const cached = await chrome.storage.session.get(null);
    for (const [key, value] of Object.entries(cached)) {
      if (key.startsWith("task-") && value.expires < Date.now()) {
        await chrome.storage.session.remove([
          key,
          key.replace("task-", "report-"),
        ]);
      }
    }
    const r = await native({
      op: "poll",
      ready: await chrome.permissions.contains({ origins: ["https://*/*"] }),
    });
    await chrome.storage.session.set({ connection: r.error || "Connected" });
    for (const t of r.tasks || []) {
      const tabs = await chrome.tabs.query({});
      const matches = tabs.filter((x) => {
        try {
          return x.status === "complete" && exact(x.url) === t.url;
        } catch {
          return false;
        }
      });
      if (matches.length !== 1) {
        await chrome.storage.session.set({
          connection: matches.length
            ? "Close duplicate application tabs, then retry."
            : "Waiting for exact application URL. Redirects need a new desktop task.",
        });
        continue;
      }
      const tab = matches[0];
      if (
        !(await chrome.permissions.contains({
          origins: [new URL(t.url).origin + "/*"],
        }))
      )
        continue;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["fill.js"],
      });
      const packet = await native({
        op: "claim",
        id: t.id,
        nonce: t.nonce,
        url: t.url,
      });
      if (packet.error) {
        await chrome.storage.session.set({ connection: packet.error });
        continue;
      }
      await chrome.storage.session.set({ ["task-" + tab.id]: packet });
      await fill(tab.id, packet);
      await native({ op: "ack", id: t.id, nonce: t.nonce, url: t.url });
    }
  } catch {
    await chrome.storage.session.set({
      connection:
        "Page access or connection failed. Reconnect and retry OPEN & FILL.",
    });
  } finally {
    running = false;
  }
}
chrome.runtime.onMessage.addListener((m, s, reply) => {
  if (
    s.id !== chrome.runtime.id ||
    s.tab ||
    !s.url?.startsWith(chrome.runtime.getURL("popup.html"))
  )
    return;
  (async () => {
    if (m.op === "connect") {
      await poll();
      return;
    }
    if (m.op === "retry") {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const d = await chrome.storage.session.get("task-" + tab.id);
      if (!d["task-" + tab.id]) throw Error("Use OPEN & FILL first.");
      await fill(tab.id, d["task-" + tab.id], m.only);
    }
  })()
    .then(() => reply({ ok: true }))
    .catch((e) => reply({ error: e.message }));
  return true;
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === "complete") poll();
});
chrome.alarms.create("reconnect", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(poll);
chrome.runtime.onStartup.addListener(poll);
chrome.runtime.onInstalled.addListener(poll);
setInterval(poll, 3000);
poll();

chrome.tabs.onRemoved.addListener((id) =>
  chrome.storage.session.remove(["task-" + id, "report-" + id]),
);
