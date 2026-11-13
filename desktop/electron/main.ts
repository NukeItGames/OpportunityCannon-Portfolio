import { BrowserBridge } from "./browser";
import { execFileSync } from "node:child_process";
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  clipboard,
  safeStorage,
} from "electron";
import { join } from "node:path";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  emptyProfiles,
  validateProfiles,
  packetFields,
  encryptBackup,
  decryptBackup,
  previewImport,
  mergeImport,
  sharedFields,
} from "./profiles";
import { Store, canonical, key, blocked } from "./core";
import { search, vc } from "./search";
import { authorize, refreshGoogle, sync, answer } from "./integrations";
let vaultPath = "";
let win: BrowserWindow,
  db: Store,
  busy = false,
  integrationBusy = false;
function secureGet(id: string) {
  const vault = existsSync(vaultPath)
    ? JSON.parse(safeStorage.decryptString(readFileSync(vaultPath)))
    : {};
  const v = vault[id];
  return v
    ? JSON.parse(safeStorage.decryptString(Buffer.from(v, "base64")))
    : {};
}
function secureSet(id: string, v: any) {
  if (!safeStorage.isEncryptionAvailable())
    throw Error("Windows secure storage unavailable");
  const vault = existsSync(vaultPath)
    ? JSON.parse(safeStorage.decryptString(readFileSync(vaultPath)))
    : {};
  vault[id] = safeStorage.encryptString(JSON.stringify(v)).toString("base64");
  writeFileSync(
    vaultPath + ".tmp",
    safeStorage.encryptString(JSON.stringify(vault)),
    { mode: 0o600 },
  );
  renameSync(vaultPath + ".tmp", vaultPath);
}
function modeValue(v: any): "vc" | "job" {
  if (v !== "vc" && v !== "job") throw Error("Choose VC Funding or Job Search");
  return v;
}
function settings(mode: "vc" | "job") {
  const p = db.get("profiles-v1", emptyProfiles());
  return { ...p[mode], ...p.shared };
}
function saveSettings(v: any, mode: "vc" | "job") {
  const p = db.get("profiles-v1", emptyProfiles());
  for (const k of sharedFields) {
    p.shared[k] = v[k] || "";
    delete v[k];
  }
  p[mode] = v;
  db.set("profiles-v1", validateProfiles(p));
}
let pendingImport: any = null;
let bridge: BrowserBridge;
function portableSnapshot(source: Store) {
  const s = source.snapshot();
  s.settings = s.settings
    .filter(
      (r: any) =>
        !["integrations", "googleAuth", "browser-tasks-v1"].includes(r.id),
    )
    .map((r: any) => {
      if (
        ["profile-job", "profile-vc"].includes(r.id) &&
        typeof r.body === "string"
      )
        return {
          ...r,
          body: JSON.parse(
            safeStorage.decryptString(Buffer.from(r.body, "base64")),
          ),
        };
      return r;
    });
  s.packets = s.packets.map((r: any) =>
    r.body.encrypted
      ? {
          ...r,
          body: {
            record: r.body.record,
            packet: JSON.parse(
              safeStorage.decryptString(
                Buffer.from(r.body.encrypted, "base64"),
              ),
            ),
          },
        }
      : r,
  );
  return s;
}
if (process.env.CANNON_TEST_DATA)
  app.setPath("userData", process.env.CANNON_TEST_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(() => {
      const home = process.env.CANNON_TEST_DATA || app.getPath("userData");
      mkdirSync(home, { recursive: true });
      if (!safeStorage.isEncryptionAvailable())
        throw Error("Windows secure storage unavailable");
      db = new Store(join(home, "opportunities.sqlite"), {
        seal: (s) => safeStorage.encryptString(s).toString("base64"),
        open: (s) => safeStorage.decryptString(Buffer.from(s, "base64")),
      });
      vaultPath = join(home, "credentials.dpapi");
      bridge = new BrowserBridge(db);
      const hostExe = app.isPackaged
        ? join(process.resourcesPath, "native", "CannonHost.exe")
        : join(__dirname, "native", "CannonHost.exe");
      const hostSecret = execFileSync(hostExe, ["--secret"], {
        windowsHide: true,
        encoding: "utf8",
      }).trim();
      if (!/^[a-f0-9]{64}$/.test(hostSecret))
        throw Error("Invalid host identity");
      bridge.start((t) => {
        const record = db.list().find((o) => o.id === t.record);
        if (
          !record ||
          record.kind !== t.kind ||
          db.isProtected(record) ||
          record.intakeRoute === "email" ||
          record.verification === "EMAIL ONLY" ||
          blocked(record.name, record.url, settings(t.kind).excludedDomains)
        )
          throw Error("Application blocked");
        return packetFields(
          db.get("profiles-v1", emptyProfiles()),
          t.kind,
          t.url,
        );
      }, hostSecret);
      for (const id of ["integrations", "googleAuth"]) {
        const old = db.get(id, null);
        if (old) {
          secureSet(
            id,
            JSON.parse(safeStorage.decryptString(Buffer.from(old, "base64"))),
          );
          db.db.prepare("DELETE FROM settings WHERE id=?").run(id);
        }
      }
      app.setAppUserModelId("com.nukeitgames.opportunitycannon");
      win = new BrowserWindow({
        title: "Opportunity Cannon",
        icon: join(__dirname, "../dist/logo.png"),
        width: 1360,
        height: 900,
        minWidth: 950,
        minHeight: 650,
        backgroundColor: "#111322",
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_w, _p, cb) =>
        cb(false),
      );
      win.loadFile(join(__dirname, "../dist/index.html"));
      ipcMain.handle("cannon", async (event, name, ...args) => {
        if (
          event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame
        )
          throw Error("Unauthorized frame");
        try {
          switch (name) {
            case "profiles":
              return {
                profiles: db.get("profiles-v1", emptyProfiles()),
                complete: db.get("setup-complete", false),
                legacy: ["profile-job", "profile-vc"].filter(
                  (k) => db.get(k, null) !== null,
                ),
              };
            case "profilesSave":
              db.transaction(() => {
                db.set("profiles-v1", validateProfiles(args[0]));
                db.set("setup-complete", true);
              });
              return true;
            case "legacyPreview": {
              const p = emptyProfiles() as any;
              const contacts: any = {};
              for (const mode of ["job", "vc"]) {
                let old = db.get("profile-" + mode, null);
                if (typeof old === "string")
                  old = JSON.parse(
                    safeStorage.decryptString(Buffer.from(old, "base64")),
                  );
                if (old) {
                  contacts[mode] = Object.fromEntries(
                    sharedFields.map((k) => [k, old[k] || ""]),
                  );
                  p[mode] = { ...p[mode], enabled: true, ...old };
                  for (const k of sharedFields) {
                    if (!p.shared[k] && old[k]) p.shared[k] = old[k];
                    delete p[mode][k];
                  }
                }
              }
              return { profiles: p, contacts };
            }
            case "backupExport": {
              const data = encryptBackup(portableSnapshot(db), args[0]);
              const r = await dialog.showSaveDialog(win, {
                title: "Save password-encrypted backup",
                filters: [
                  {
                    name: "Cannon encrypted backup",
                    extensions: ["cannonbackup"],
                  },
                ],
              });
              if (r.canceled) return false;
              writeFileSync(r.filePath!, data, { mode: 0o600 });
              return true;
            }
            case "backupPreview": {
              pendingImport = null;
              const r = await dialog.showOpenDialog(win, {
                title: "Preview encrypted backup or legacy SQLite database",
                properties: ["openFile"],
                filters: [
                  {
                    name: "Cannon data",
                    extensions: ["cannonbackup", "sqlite", "db"],
                  },
                ],
              });
              if (r.canceled) return null;
              if (/\.(sqlite|db)$/i.test(r.filePaths[0])) {
                const source = new DatabaseSync(r.filePaths[0], {
                  readOnly: true,
                });
                try {
                  pendingImport = Object.fromEntries(
                    ["opportunities", "settings", "history", "packets"].map(
                      (t) => [
                        t,
                        source
                          .prepare(`SELECT * FROM ${t}`)
                          .all()
                          .map((r: any) => {
                            if (r.body === undefined) return r;
                            const body = r.body.startsWith("dpapi:")
                              ? JSON.parse(
                                  safeStorage.decryptString(
                                    Buffer.from(r.body.slice(6), "base64"),
                                  ),
                                )
                              : JSON.parse(r.body);
                            if (["integrations", "googleAuth"].includes(r.id))
                              return { ...r, body: null };
                            if (
                              ["profile-job", "profile-vc"].includes(r.id) &&
                              typeof body === "string"
                            )
                              return {
                                ...r,
                                body: JSON.parse(
                                  safeStorage.decryptString(
                                    Buffer.from(body, "base64"),
                                  ),
                                ),
                              };
                            if (t === "packets" && body.encrypted)
                              return {
                                ...r,
                                body: {
                                  record: body.record,
                                  packet: JSON.parse(
                                    safeStorage.decryptString(
                                      Buffer.from(body.encrypted, "base64"),
                                    ),
                                  ),
                                },
                              };
                            return { ...r, body };
                          }),
                      ],
                    ),
                  );
                } finally {
                  source.close();
                }
                pendingImport.settings = pendingImport.settings.filter(
                  (r: any) =>
                    ![
                      "integrations",
                      "googleAuth",
                      "browser-tasks-v1",
                    ].includes(r.id),
                );
              } else
                pendingImport = decryptBackup(
                  readFileSync(r.filePaths[0], "utf8"),
                  args[0],
                );
              return previewImport(db, pendingImport);
            }
            case "backupMerge": {
              if (!pendingImport) throw Error("Preview an archive first");
              mergeImport(db, pendingImport);
              pendingImport = null;
              return true;
            }

            case "state": {
              const mode = modeValue(args[0]);
              return {
                items: db.list().filter((o) => o.kind === mode),
                settings: settings(mode),
                log: db.get("log-" + mode, []),
                last: db.get("last-" + mode, "Never"),
                dataPath: home,
                version: app.getVersion(),
                busy,
              };
            }
            case "settings":
              saveSettings(args[0], modeValue(args[1]));
              return true;
            case "search": {
              if (busy) throw Error("A search is already running");
              const mode = modeValue(args[0]);
              busy = true;
              const log: string[] = [];
              const emit = (s: string) => {
                log.push(s);
                db.set("log-" + mode, log);
                win.webContents.send("progress", s);
              };
              try {
                // A failed or removed source must not leave previously verified matches promoted.
                for (const old of db.list().filter((o) => o.kind === mode))
                  db.put({
                    ...old,
                    classification: "Requires Verification",
                    eligibilityState: "Missing information",
                    disqualifications: [],
                    missingInformation: [
                      "Awaiting successful discovery recheck",
                    ],
                    score: 0,
                    reviewPriority: 0,
                    reasons: [
                      "Awaiting successful discovery recheck; source may be unavailable or listing removed",
                    ],
                  });
                const seeds: any[] = []; // Sources belong exclusively to the active local profile.
                const searchSettings = settings(mode);
                const policy = JSON.parse(
                  searchSettings.discoveryPolicy || "{}",
                );
                policy.excludedOpportunities = [
                  policy.excludedOpportunities || "",
                  ...db
                    .list()
                    .filter(
                      (o) =>
                        o.kind === mode &&
                        ["Applied", "Rejected"].includes(o.status),
                    )
                    .map((o) => o.url),
                ].join("\n");
                await search(
                  mode,
                  seeds,
                  {
                    ...searchSettings,
                    discoveryPolicy: JSON.stringify(policy),
                  },
                  emit,
                  (o) => db.put(o),
                );
                db.set("last-" + mode, new Date().toISOString());
              } finally {
                busy = false;
              }
              return true;
            }
            case "notes":
              db.notes(args[0], String(args[1]), String(args[2]));
              return true;
            case "history":
              return db.db
                .prepare(
                  "SELECT changed,status FROM history WHERE opportunity=? ORDER BY id DESC",
                )
                .all(args[0]);
            case "status":
              db.status(args[0], args[1], args[2] === true);
              return true;
            case "copy":
              clipboard.writeText(String(args[0]));
              return true;
            case "open": {
              const o = db.list().find((x) => x.id === args[0]);
              if (!o) throw Error("Unknown record");
              if (
                blocked(o.name, o.url, settings(o.kind).excludedDomains) ||
                db.isProtected(o)
              )
                throw Error(
                  "Previously submitted/rejected opportunity blocked",
                );
              if (o.intakeRoute === "email" || o.verification === "EMAIL ONLY")
                throw Error("EMAIL ONLY: no browser application verified");
              const fields = packetFields(
                db.get("profiles-v1", emptyProfiles()),
                o.kind,
                o.url,
              );
              const packet = {
                version: 1,
                url: canonical(o.url),
                kind: o.kind,
                created: new Date().toISOString(),
                fields,
              };
              db.packet({
                record: o.id,
                encrypted: safeStorage
                  .encryptString(JSON.stringify(packet))
                  .toString("base64"),
              });
              if (args[1]) {
                if (!bridge.status().connected)
                  throw Error(
                    "Browser disconnected. Open extension and reconnect in Settings first.",
                  );
                bridge.queue(o.url, o.kind, o.id);
              }
              await shell.openExternal(canonical(o.url));
              return true;
            }
            case "import": {
              const url = canonical(args[0]);
              if (
                blocked(
                  args[1],
                  url,
                  settings(modeValue(args[2])).excludedDomains,
                )
              )
                throw Error("Duplicate/rejected investor blocked");
              const o = await vc({
                url,
                name: String(args[1] || new URL(url).hostname),
                context:
                  "Manually imported; confirm official ownership and eligibility.",
              });
              o.kind = modeValue(args[2]);
              o.id = o.kind + ":" + key(url);
              o.score = 0;
              o.verification =
                "Manual import — official ownership and eligibility unverified";
              db.put(o);
              return true;
            }
            case "file": {
              const r = await dialog.showOpenDialog(win, {
                properties: ["openFile"],
              });
              return r.filePaths[0] || "";
            }
            case "browserStatus":
              return bridge.status();
            case "browserRepair": {
              const dir = app.isPackaged
                ? join(process.resourcesPath, "native")
                : join(__dirname, "native");
              const manifest = join(dir, "host.json");
              writeFileSync(
                manifest,
                JSON.stringify({
                  name: "com.opportunitycannon.bridge",
                  description: "Opportunity Cannon local bridge",
                  path: join(dir, "CannonHost.exe"),
                  type: "stdio",
                  allowed_origins: [
                    "chrome-extension://aniflijjcgbekbpcpmkljoeflifjhobl/",
                  ],
                }),
              );
              for (const browser of ["Google\\Chrome", "Microsoft\\Edge"])
                execFileSync(
                  "reg.exe",
                  [
                    "add",
                    `HKCU\\Software\\${browser}\\NativeMessagingHosts\\com.opportunitycannon.bridge`,
                    "/ve",
                    "/t",
                    "REG_SZ",
                    "/d",
                    manifest,
                    "/f",
                  ],
                  { windowsHide: true },
                );
              return bridge.status();
            }
            case "extension":
              await shell.openPath(
                app.isPackaged
                  ? join(process.resourcesPath, "extension")
                  : join(__dirname, "../extension"),
              );
              return true;
            case "tracker": {
              const id = secureGet("integrations").googleSheetId;
              if (!id || !/^[a-zA-Z0-9_-]+$/.test(id))
                throw Error(
                  "Enter your master spreadsheet ID in Settings first",
                );
              await shell.openExternal(
                `https://docs.google.com/spreadsheets/d/${id}/edit`,
              );
              return true;
            }
            case "integrationStatus": {
              const c = secureGet("integrations");
              return {
                googleClientId: c.googleClientId || "",
                googleSheetId: c.googleSheetId || "",
                aiModel: c.aiModel || "",
                hasKey: !!c.aiKey,
                connected: !!secureGet("googleAuth").refresh_token,
              };
            }
            case "integrationSave": {
              const old = secureGet("integrations"),
                v = args[0];
              secureSet("integrations", {
                googleClientId: String(v.googleClientId || ""),
                googleSheetId: String(v.googleSheetId || ""),
                googleClientSecret:
                  v.googleClientSecret || old.googleClientSecret || "",
                aiModel: String(v.aiModel || ""),
                aiKey: v.aiKey || old.aiKey || "",
              });
              return true;
            }
            case "googleDisconnect":
              secureSet("googleAuth", {});
              return true;
            case "googleConnect": {
              if (integrationBusy)
                throw Error("Integration operation already in progress");
              integrationBusy = true;
              try {
                const c = secureGet("integrations");
                secureSet(
                  "googleAuth",
                  await authorize(
                    c.googleClientId || "",
                    c.googleClientSecret || "",
                    (url) => shell.openExternal(url),
                  ),
                );
                return true;
              } finally {
                integrationBusy = false;
              }
            }
            case "sync": {
              if (integrationBusy)
                throw Error("Integration operation already in progress");
              integrationBusy = true;
              try {
                const t = await refreshGoogle(
                  secureGet("integrations"),
                  secureGet("googleAuth"),
                );
                return await sync(
                  db,
                  modeValue(args[0]),
                  t.access_token,
                  secureGet("integrations").googleSheetId || "",
                );
              } finally {
                integrationBusy = false;
              }
            }
            case "ai": {
              modeValue(args[0]);
              if (args[3] !== true)
                throw Error(
                  "Explicit per-request sharing authorization required",
                );
              return answer(
                secureGet("integrations"),
                String(args[1]),
                String(args[2]),
              );
            }
            default:
              throw Error("Unsupported command");
          }
        } catch (error) {
          if (
            error instanceof Error &&
            /^(Browser disconnected\.|Previously submitted|EMAIL ONLY|Review and explicitly|Invalid |Unknown opportunity|Only HTTPS|Public URLs)/.test(
              error.message,
            )
          )
            throw error;
          throw Error(
            "Operation failed. Check profile values, file access, credentials and network availability.",
          );
        }
      });
    })
    .catch(() => {
      dialog.showErrorBox(
        "Local data unavailable",
        "Unable to unlock or migrate local data. Original records were retained. Use the original Windows account or restore a password-encrypted backup.",
      );
      app.quit();
    });
app.on("window-all-closed", () => app.quit());
