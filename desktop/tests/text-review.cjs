const { _electron: electron }=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
(async()=>{const root=fs.mkdtempSync(path.resolve('.test-data','text-review-'));const env={...process.env,CANNON_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({args:['.'],env});const page=await app.firstWindow();await page.getByText('Last name (optional)',{exact:true}).waitFor();await page.screenshot({path:'test-results/text-review.png'});await app.evaluate(({app})=>{app.focus({steal:true});});process.exit(0);})();
