const { _electron: electron } = require('@playwright/test');
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
(async () => {
 const out = path.resolve('test-results/ui-final'); fs.mkdirSync(out,{recursive:true});
 const data = fs.mkdtempSync(path.resolve('.test-data','ui-final-'));
 const env = {...process.env,CANNON_TEST_DATA:data}; delete env.ELECTRON_RUN_AS_NODE;
 const exe = path.resolve(process.argv[2]);
 const launch = () => electron.launch({executablePath:exe,env});
 let app = await launch(), p = await app.firstWindow();
 const results=[];
 const pass = name => {results.push({name,status:'PASS'});console.log('PASS',name);};
 const shot = name => p.screenshot({path:path.join(out,name+'.png'),fullPage:true});
 try {
 await p.getByRole('heading',{name:'Set up Opportunity Cannon'}).waitFor();
 assert(await p.getByAltText('Opportunity Cannon').evaluate(i=>i.complete&&i.naturalWidth>0));
 await shot('onboarding');pass('Packaged logo and corrected labels');
 await p.evaluate(async()=>{const s=(await window.cannon.call('profiles')).profiles;s.shared.name='Fictional Demo';s.shared.email='demo@example.test';s.job.enabled=true;s.vc.enabled=true;await window.cannon.call('profilesSave',s);});
 await app.evaluate(({app,safeStorage})=>{
 const {DatabaseSync}=process.getBuiltinModule('node:sqlite');const db=new DatabaseSync(process.getBuiltinModule('node:path').join(app.getPath('userData'),'opportunities.sqlite'));
 for(const kind of ['job','vc'])for(const [i,classification,status] of [[1,'Strong Match','New'],[2,'Requires Verification','New'],[3,'Filtered Out','Rejected']]){
 const body={id:kind+i,kind,name:`Fictional ${kind==='job'?'career':'funding'} opportunity ${i}`,company:'Fictional Demo Organization',url:`https://example.test/${kind}/${i}`,score:i===1?85:0,reviewPriority:42,classification,status,checked:new Date().toISOString(),details:'Fictional acceptance fixture. No external application exists. '+('Long content for scrolling. '.repeat(50)),verification:'Synthetic fixture only',eligibilityState:'Missing information',reasons:['Fictional evidence; not a verified opportunity'],location:'Example City',salary:kind==='job'?'$80,000–$100,000':undefined,mode:'Remote'};
 db.prepare('INSERT INTO opportunities VALUES (?,?)').run(body.id,'dpapi:'+safeStorage.encryptString(JSON.stringify(body)).toString('base64'));
 }db.close();});
 await p.reload();await shot('workspace-chooser');
 for(const mode of ['JOB SEARCH','VC FUNDING']){
 await p.getByRole('heading',{name:mode,exact:true}).click();
 await p.locator('article').first().waitFor();
 for(const [w,h] of [[1920,1080],[1366,768],[1280,720],[1024,768],[950,650]]){
 await p.setViewportSize({width:w,height:h});await shot(`${mode.split(' ')[0]}-${w}`);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${mode} overflow ${w}`);
 }pass(mode+' populated layout at five viewport sizes');
 await p.getByLabel('Search opportunities',{exact:true}).fill('no-such-fixture');await p.getByRole('heading',{name:'Your next opportunity starts here.'}).waitFor();await shot(mode.split(' ')[0]+'-empty');
 await p.getByLabel('Search opportunities',{exact:true}).fill('');
 await p.getByLabel('Quality',{exact:false}).selectOption('Strong Match');assert.equal(await p.locator('article').count(),1);
 await p.getByRole('button',{name:'Review details',exact:true}).click();
 const modal=p.getByRole('dialog');await modal.waitFor();await shot(mode.split(' ')[0]+'-details');
 assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Close details');
 await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'OPEN APPLICATION');
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Close details');
 await p.getByLabel('Notes',{exact:true}).fill('Fictional review note');await p.getByRole('button',{name:'Save notes',exact:true}).click();
 await p.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Review details');pass(mode+' dialog semantics, focus cycle, Escape and notes');
 await p.getByRole('button',{name:'SAVE',exact:true}).click();await p.getByLabel('Application status filter').selectOption('Saved');await p.locator('article').first().waitFor();pass(mode+' search, quality and status filters');
 await p.getByLabel('Application status filter').selectOption('all');
 await p.getByLabel('Quality',{exact:false}).selectOption('all');
 const rejected=p.locator('article').filter({has:p.getByRole('heading',{name:/opportunity 3$/})});assert(await rejected.getByRole('button',{name:'OPEN APPLICATION',exact:true}).isDisabled());
 await shot(mode.split(' ')[0]+'-rejected');
 await p.getByRole('button',{name:'Profiles & settings',exact:true}).click();
 await p.getByText('Encrypted backup and safe import',{exact:true}).click();
 await p.getByLabel('Backup password',{exact:true}).fill('short');await p.getByRole('button',{name:'Export encrypted backup',exact:true}).click();await p.getByRole('alert').first().waitFor();await shot(mode.split(' ')[0]+'-backup-validation');
 await p.getByLabel('Backup password',{exact:true}).fill('fictional-backup-password');
 const backup=path.join(data,'fixture.cannonbackup');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},backup);
 await p.getByRole('button',{name:'Export encrypted backup',exact:true}).click();await p.getByText('Encrypted backup saved',{exact:true}).waitFor();
 await p.getByLabel('Backup password',{exact:true}).fill('fictional-backup-password');await p.getByRole('button',{name:'Preview backup or legacy database',exact:true}).click();await p.getByRole('button',{name:'Merge previewed data',exact:true}).waitFor();await shot(mode.split(' ')[0]+'-backup-preview');
 await p.getByRole('button',{name:'Merge previewed data',exact:true}).click();await p.getByText('Merged safely. Existing records retained.',{exact:true}).waitFor();pass(mode+' encrypted export/preview/merge and invalid password; file pickers stubbed');
 await shot(mode.split(' ')[0]+'-settings');
 await p.getByRole('button',{name:'Switch mode',exact:true}).click();
 }
 await app.close();app=await launch();p=await app.firstWindow();
 const state=await p.evaluate(()=>window.cannon.call('state','job'));assert.equal(state.items.length,3);assert(state.items.some(x=>x.notes==='Fictional review note'));pass('Packaged restart, notes persistence and backup deduplication');
 await p.getByRole('heading',{name:'JOB SEARCH',exact:true}).click();await p.locator('article').first().waitFor();await p.setViewportSize({width:1366,height:768});await shot('manual-review');
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({results,artifact:'fresh packaged executable; not OS installed',dataIsolation:'new fictional test directory',nativeDialogs:'stubbed'},null,2));
 await app.close();console.log('PASS packaged UI acceptance; isolated application closed');
 }catch(e){fs.writeFileSync(path.join(out,'failure.txt'),e.stack);await shot('failure').catch(()=>{});await app.close();throw e;}
})().catch(e=>{console.error(e);process.exitCode=1;});
