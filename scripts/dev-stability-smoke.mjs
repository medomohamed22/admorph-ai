import {chromium,expect} from '@playwright/test';
import {writeFile,unlink,access,mkdir} from 'node:fs/promises';
const probe='releases/verification-1.0.0/hmr-stability-probe.html';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
let created=false;
try{
 const page=await browser.newPage({viewport:{width:375,height:812}}),errors=[],navigations=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
 await page.goto('http://localhost:3000');await expect(page.getByRole('heading',{level:1})).toContainText('One product.');
 await page.waitForTimeout(2000);const count=navigations.length,origin=await page.evaluate(()=>performance.timeOrigin);
 await page.waitForTimeout(12000);
 await expect.poll(()=>page.evaluate(()=>performance.timeOrigin)).toBe(origin);expect(navigations.length).toBe(count);
 await access(probe).then(()=>{throw new Error('Probe already exists');},()=>{});
 await writeFile(probe,'<div class="text-fuchsia-700 p-11">Generated release probe</div>');created=true;
 await page.waitForTimeout(10000);expect(await page.evaluate(()=>performance.timeOrigin)).toBe(origin);expect(navigations.length).toBe(count);
 await page.getByLabel('Headline',{exact:true}).fill('Stable without flashing');await expect(page.getByTestId('creative-headline')).toHaveText('Stable without flashing');
 await page.goto('http://localhost:3000/settings');await expect(page.getByLabel('API key',{exact:true})).toBeVisible();
 const settingsOrigin=await page.evaluate(()=>performance.timeOrigin),settingsNavigations=navigations.length;await page.waitForTimeout(8000);
 expect(await page.evaluate(()=>performance.timeOrigin)).toBe(settingsOrigin);expect(navigations.length).toBe(settingsNavigations);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 const result={checkedAtUTC:new Date().toISOString(),mode:'development-server',viewport:375,unexpectedReloads:0,generatedReleaseChangeIgnored:true,interactiveEditing:true,settingsStable:true,browserErrors:errors};
 await writeFile('test-results/dev-stability.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{if(created)await unlink(probe);await browser.close();}
