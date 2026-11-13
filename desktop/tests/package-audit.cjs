const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  asar = require("@electron/asar");
const { inspect, walk } = require("../native/privacy-check.cjs");
const root = path.resolve(process.argv[2]);
const archive = path.join(root, "resources/app.asar");
const entries = asar.listPackage(archive).map((p) => p.replaceAll("\\", "/"));
const forbidden = entries.filter((p) =>
  /\.(sqlite(?:-wal|-shm)?|db|dpapi|cannonbackup|packet\.json)$|\/(archive|snapshots|evidence|\.git|\.test-data|test-results)\//i.test(
    p,
  ),
);
assert.deepEqual(forbidden, []);
const owned = entries.filter(
  (p) =>
    p !== "/node_modules" &&
    !p.startsWith("/node_modules/") &&
    !p.includes("/node_modules/"),
);
for (const p of owned) {
  assert(
    /^\/(build|dist|extension|data)(\/|$)|^\/package\.json$/.test(p),
    `Unexpected application-owned resource ${p}`,
  );
}
if (process.argv[3] === "generic") {
  assert(
    !entries.some((p) => p.includes("investors.json")),
    "Personal source catalog must not be packaged",
  );
  const pkg = JSON.parse(asar.extractFile(archive, "package.json").toString());
  assert.equal(pkg.version, require("../package.json").version);
  const identity = JSON.parse(
    asar.extractFile(archive, "build/identity.json").toString(),
  );
  assert.equal(identity.version, pkg.version);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(root, "resources/extension/manifest.json")),
    ).version,
    pkg.version,
  );
  assert.equal(pkg.author, "Opportunity Cannon contributors");
  for (const p of owned) {
    const stat = asar.statFile(archive, path.normalize(p.slice(1)));
    if (stat.files) continue;
    const text = asar
      .extractFile(archive, path.normalize(p.slice(1)))
      .toString("utf8");
    inspect(text, p);
    if (p === "/package.json") continue;
    assert(
      !/Your next role in Unconfigured City|FIND UNCONFIGURED JOBS|Legacy Product Application Helper|LEGACY PRODUCT OPPORTUNITY CANNON|legacy-employer|legacy-investor|private-user@example/i.test(
        text,
      ),
      `Developer-specific content in ${p}`,
    );
  }
}
assert(fs.existsSync(path.join(root, "resources/extension/manifest.json")));
console.log(
  `PASS: actual installer ASAR (${entries.length} entries), application resource allowlist, no databases/credentials/private history/archives; external extension present`,
);

// External resources are shipped beside ASAR and must be examined too.
for (const dir of ["extension", "native"]) {
  for (const file of walk(path.join(root,"resources",dir))) {
    const data = fs.readFileSync(file);
    if (path.basename(file) === "host.json") {
      const host=JSON.parse(data);
      assert.equal(host.name,"com.opportunitycannon.bridge");
      assert.equal(path.resolve(path.dirname(file),host.path),path.join(root,"resources/native/CannonHost.exe"));
      inspect(JSON.stringify({...host,path:"CannonHost.exe"}),"generated host manifest");
    } else inspect(data.toString("utf8"), path.relative(root,file));
    if (/\.exe$/i.test(file)) inspect(data.toString("utf16le"),path.relative(root,file));
    assert(!/\.(sqlite|db|dpapi|cannonbackup|pem|key)$/i.test(file));
  }
}
console.log("PASS external extension/native resources privacy patterns");
