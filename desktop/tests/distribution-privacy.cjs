// Scan actual extracted installer files and every decompressed ASAR entry.
// Findings contain file names and pattern indexes, never matched values.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('@electron/asar');
const {walk,rules}=require('../native/privacy-check.cjs');
const root=path.resolve(process.argv[2]), release=path.resolve(process.argv[3]);
let files=0,bytes=0;const findings=[],vendorMatches=[];
function scan(data,label) {
 files++;bytes+=data.length;
 for(const encoding of ['utf8','utf16le']) {
  const text=data.toString(encoding);
  for(const [index,rule] of rules.entries()) {
   const match=text.match(rule);if(!match)continue;
   // Random binary byte matches must also occur in the unmodified vendor file.
   const vendor=path.join('node_modules/electron/dist',label==='Opportunity Cannon.exe'?'electron.exe':label);
   if(fs.existsSync(vendor)&&fs.statSync(vendor).isFile()&&fs.readFileSync(vendor).toString(encoding).includes(match[0])) {
    vendorMatches.push({file:label,rule:index,encoding});continue;
   }
   findings.push({file:label,rule:index,encoding});
  }
  const username=process.env.USERNAME;
  if(username&&username.length>=4&&text.toLowerCase().includes(username.toLowerCase())) {
   const vendor=path.join('node_modules/electron/dist',label==='Opportunity Cannon.exe'?'electron.exe':label);
   if(!fs.existsSync(vendor)||!fs.readFileSync(vendor).toString(encoding).toLowerCase().includes(username.toLowerCase())) findings.push({file:label,rule:'local-account-name',encoding});
  }
 }
}
for(const file of walk(root))scan(fs.readFileSync(file),path.relative(root,file));
const archive=path.join(root,'resources/app.asar');
for(const entry of asar.listPackage(archive)) {
 const name=entry.replaceAll('\\','/').replace(/^\//,'');
 if(!asar.statFile(archive,path.normalize(name)).files)scan(asar.extractFile(archive,path.normalize(name)),'ASAR/'+name);
}
for(const file of walk(release).filter(f=>!f.includes(path.sep+'win-unpacked'+path.sep)))scan(fs.readFileSync(file),'release/'+path.relative(release,file));
const result={files,bytes,findings,vendorMatches};
fs.writeFileSync('test-results/privacy-final/distribution-scan.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));assert.deepEqual(findings,[]);
