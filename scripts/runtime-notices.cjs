// Preserve upstream terms beside the unsigned installer; never relicense them.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const payload=path.resolve(process.argv[2]), output=path.resolve(process.argv[3]);
for (const file of ['LICENSE.electron.txt','LICENSES.chromium.html']) assert(fs.existsSync(path.join(payload,file)), `Missing Electron notice ${file}`);
const asar=require('../desktop/node_modules/@electron/asar');
const archive=path.join(payload,'resources/app.asar');
const notices=[];
for (const entry of asar.listPackage(archive)) {
  const name=entry.replaceAll('\\','/').replace(/^\//,'');
  const archivePath=path.normalize(name);
  if (/(^|\/)(licen[cs]e|notice|copying)(\.[^/]*)?$/i.test(name) && !asar.statFile(archive,archivePath).files) {
    notices.push(`\n===== ${name} =====\n${asar.extractFile(archive,archivePath).toString()}`);
  }
}
assert(notices.length>5,'Runtime package licenses must be present');
for(const file of ['LICENSE.electron.txt','LICENSES.chromium.html']) notices.push(`\n===== ${file} =====\n${fs.readFileSync(path.join(payload,file),'utf8')}`);
fs.writeFileSync(path.join(output,'RUNTIME-NOTICES.txt'),notices.join('\n'));
console.log(`PASS retained runtime notices: ${notices.length} documents`);
