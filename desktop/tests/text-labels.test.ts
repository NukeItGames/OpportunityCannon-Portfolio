const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('every profile field has an explicit readable display label',()=>{
 const source=fs.readFileSync('src/ProfileManager.tsx','utf8');
 const fields=source.split('const fields: any = {')[1].split('const labels:')[0];
 const labels=source.split('const labels: Record<string, string> = {')[1].split('const titles')[0];
 for(const [,key] of fields.matchAll(/"(\w+)"/g)) assert.match(labels,new RegExp('\\b'+key+': "[^"\\n]+"'),key);
});
