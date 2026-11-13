// This check contains patterns, never a catalog of real user identities.
const fs = require('node:fs');
const path = require('node:path');
const rules = [
  /[A-Z]:[\\/]Users[\\/][^\\/\s"']+/i,
  /https:\/\/docs\.google\.com\/(?:spreadsheets|document)\/d\/[\w-]{20,}/i,
  /(?:ghp_|github_pat_|sk-proj-|AIza)[A-Za-z0-9_-]{15,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /https:\/\/drive\.google\.com\/(?:file\/d\/|drive\/folders\/)[\w-]{20,}/i,
  /\/(?:Users|home)\/[^/\s"']+\//,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/,
  /(?:xox[baprs]-|sk_live_)[A-Za-z0-9_-]{15,}/,
];
function inspect(text, label) {
  if (rules.some(r => r.test(text))) throw Error(`Private-data pattern in ${label}`);
  const contacts = text.replace(/\/\*[*!]?[\s\S]*?\*\//g, block => /\bMIT License\b/.test(block) ? "" : block);
  for (const email of contacts.match(/[\w.+-]+@(?:[\w-]+\.)+[A-Za-z]{2,}\b/g) || []) {
    // Reserved fictional domains and public upstream package metadata only.
    if (!/@(?:[\w-]+\.)*(?:example\.(?:com|org|net|test)|example|test)$/i.test(email))
      throw Error(`Non-fictional contact in ${label}`);
  }
}
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    const p = path.join(dir,e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
function checkSource() {
  const files = ['electron','src','extension','native','tests','branding','public','../assets'].flatMap(walk);
  files.push(...fs.readdirSync('.').filter(f => /\.(md|html|json|ts)$/.test(f)));
  files.push('../README.md','../.gitignore');
  // The local execution contract is intentionally ignored and absent in clones.
  if (fs.existsSync('../AGENTS.md')) files.push('../AGENTS.md');
  for (const f of files) {
    const data = fs.readFileSync(f);
    // npm's upstream deprecation notice includes the maintainer's public contact.
    const text = f === 'package-lock.json'
      ? data.toString('utf8').replaceAll('i' + '@' + 'izs.me','upstream@example.test')
      : data.toString('utf8');
    inspect(text, f);
    if (/\.(png|ico|exe)$/i.test(f)) inspect(data.toString('utf16le'),f);
  }
  return files.length;
}
module.exports = {inspect,walk,checkSource,rules};
if (require.main === module) console.log(`PASS privacy patterns: ${checkSource()} source inputs`);
