const {chromium}=require('@playwright/test');const fs=require('fs'),path=require('path');
(async()=>{const out=path.resolve('test-results/ui-final');const results=[];
for(const channel of ['chrome','msedge']){
let context;try{
 const data=fs.mkdtempSync(path.resolve('.test-data','popup-'+channel+'-'));
 context=await chromium.launchPersistentContext(data,{channel,headless:false,args:['--disable-extensions-except='+path.resolve('extension'),'--load-extension='+path.resolve('extension')]});
 let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:8000}).catch(()=>null);
 if(!worker){results.push({channel,status:'NOT TESTED',reason:'Browser did not load unpacked extension via command line; manual installation not performed'});continue;}
 const popup=await context.newPage();await popup.goto(new URL('popup.html',worker.url()).href);await popup.getByRole('button',{name:'Fill this page or retry blank fields'}).waitFor();
 await popup.setViewportSize({width:420,height:600});await popup.screenshot({path:path.join(out,channel+'-popup.png')});
 await popup.getByRole('button',{name:'Fill this page or retry blank fields'}).click();await popup.waitForTimeout(300);await popup.screenshot({path:path.join(out,channel+'-popup-error.png')});
 results.push({channel,status:'PASS',surface:'Real extension page, icon assets, initial state and retry error',nativeMessaging:'NOT TESTED: host registration intentionally unchanged',text:await popup.locator('body').innerText()});
}catch(e){results.push({channel,status:'FAIL',error:e.message});}finally{await context?.close();}}
fs.writeFileSync(path.join(out,'extensions.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));})();
