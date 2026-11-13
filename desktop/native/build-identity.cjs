const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  cp = require("node:child_process");
const root = path.resolve(".");
const files = [
  "package.json",
  "package-lock.json",
  ...["electron", "src", "extension", "native"].flatMap((dir) =>
    fs
      .readdirSync(dir, { recursive: true })
      .map((f) => path.join(dir, f))
      .filter((f) => fs.statSync(f).isFile()),
  ),
].sort();
const hash = crypto.createHash("sha256");
for (const f of files) {
  hash.update(f.replaceAll("\\", "/"));
  hash.update(fs.readFileSync(f));
}
const identity = {
  version: require("../package.json").version,
  sourceRevision: cp
    .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .trim(),
  sourceSha256: hash.digest("hex"),
  builtAt: new Date().toISOString(),
};
fs.mkdirSync("build", { recursive: true });
fs.writeFileSync("build/identity.json", JSON.stringify(identity, null, 2));
if (require("../extension/manifest.json").version !== identity.version)
  throw Error("Extension version differs");
console.log("Build", identity.version, identity.sourceSha256);
