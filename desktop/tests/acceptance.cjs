const fs = require("fs"),
  path = require("path"),
  cp = require("child_process");
const exe = process.argv[2];
if (!exe)
  throw Error(
    "Usage: node tests/acceptance.cjs <installed-executable> [data-root] [output-root] [--live]",
  );
const data = path.resolve(
    process.argv[3] ||
      fs.mkdtempSync(path.join(require("os").tmpdir(), "cannon-acceptance-")),
  ),
  out = path.resolve(process.argv[4] || "test-results/repair");
fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const base = {
  ...process.env,
  CANNON_ACCEPTANCE_ROOT: data,
  CANNON_RESULTS: out,
};
const suites = [
  "onboarding",
  "migration",
  "preferences-ui",
  "eligibility-ui",
  "discovery-ui",
  "repair-desktop",
  "privacy",
];
const results = [];
function run(name, script, args = [], env = {}) {
  const r = cp.spawnSync(process.execPath, [script, ...args], {
    env: { ...base, ...env },
    encoding: "utf8",
    timeout: 240000,
  });
  fs.writeFileSync(
    path.join(out, name + ".log"),
    (r.stdout || "") + (r.stderr || ""),
  );
  const status = r.status === 0 ? "PASS" : "FAIL";
  results.push({ name, status, exit: r.status, error: r.error?.message });
  console.log(status, name);
}
for (const s of suites) run(s, "tests/" + s + ".cjs", [exe]);
run("package-audit", "tests/package-audit.cjs", [
  path.dirname(path.resolve(exe)),
  "generic",
]);
run("browser-controls", "tests/browsers.cjs");
for (const channel of ["msedge", "chrome"])
  run(channel + "-native", "tests/handoff.cjs", [exe], {
    CANNON_BROWSER: channel,
    CANNON_NATIVE_DIR: path.join(
      path.dirname(path.resolve(exe)),
      "resources/native",
    ),
    CANNON_EXTENSION_DIR: path.join(
      path.dirname(path.resolve(exe)),
      "resources/extension",
    ),
  });
if (process.argv.includes("--live"))
  run("installed-live", "tests/installed-live.cjs", [exe]);
else
  results.push({
    name: "installed-live",
    status: "SKIP",
    reason: "Explicit --live opt-in required",
  });
const asar = require("@electron/asar");
const identity = JSON.parse(
  asar.extractFile(
    path.join(path.dirname(path.resolve(exe)), "resources/app.asar"),
    "build/identity.json",
  ),
);
fs.writeFileSync(
  path.join(out, "summary.json"),
  JSON.stringify({ exe: path.resolve(exe), data, identity, results }, null, 2),
);
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
