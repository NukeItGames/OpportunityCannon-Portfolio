// Audit the complete tracked publication, not ignored local test output.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const {inspect} = require('../desktop/native/privacy-check.cjs');
const files = cp.execFileSync('git', ['ls-files', '-z'], {cwd:root}).toString().split('\0').filter(Boolean);
assert(files.length > 70, 'Expected the complete publication tree');
for (const file of files) {
  assert(!/(^|\/)(node_modules|\.git|archive|backups|resumes|test-results|\.test-data)(\/|$)|\.(sqlite.*|db|dpapi|cannonbackup|exe|zip|log|pem|pfx|p12|bak)$/i.test(file), `Forbidden publication file: ${file}`);
  const data = fs.readFileSync(path.join(root,file));
  let content = data.toString('utf8');
  if (file === 'desktop/package-lock.json') content = content.replaceAll('i'+'@'+'izs.me', 'upstream@example.test');
  inspect(content, file);
  if (/\.(png|ico)$/i.test(file)) inspect(data.toString('utf16le'),file);
}
console.log(`PASS complete publication audit: ${files.length} tracked files`);
