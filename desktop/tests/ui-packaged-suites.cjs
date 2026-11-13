const fs=require('fs'),cp=require('child_process'),path=require('path');
if (!process.argv[2]) throw Error('Usage: node tests/ui-packaged-suites.cjs <packaged-executable>');
fs.mkdirSync('test-results/ui-final',{recursive:true});
const exe=path.resolve(process.argv[2]);const suites=['onboarding','migration','preferences-ui','eligibility-ui','discovery-ui','repair-desktop','privacy'];const results=[];
for(const suite of suites){const r=cp.spawnSync(process.execPath,['tests/'+suite+'.cjs',exe],{encoding:'utf8',timeout:90000});fs.writeFileSync('test-results/ui-final/'+suite+'.log',(r.stdout||'')+(r.stderr||''));results.push({suite,status:r.status===0?'PASS':'FAIL',exit:r.status});console.log(suite,r.status);}
fs.writeFileSync('test-results/ui-final/suites.json',JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
