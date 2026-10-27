import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base=process.env.SMOKE_BASE_URL??'http://localhost:3000', mode=process.env.SMOKE_MODE??'production';
if(!['production','development'].includes(mode))throw new Error('Unknown smoke mode');
const en=JSON.parse(await readFile(new URL('../src/messages/en.json',import.meta.url),'utf8')), ar=JSON.parse(await readFile(new URL('../src/messages/ar.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:'chrome'}), results=[];await mkdir('docs/evidence',{recursive:true});
try {
 for(const [language,width] of [['en',1440],['ar',320]]){
  const context=await browser.newContext({viewport:{width,height:1000},locale:'ar-EG'}),page=await context.newPage(),errors=[];let paidCalls=0,navigations=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.route('**/api/ai/**',route=>{paidCalls++;return route.abort();});await page.route('**/api/providers/meta-smoke',route=>{paidCalls++;return route.abort();});
  await page.goto(`${base}/campaigns/new`);await expect(page.locator('html')).toHaveAttribute('lang','en');await page.getByRole('button',{name:'Use sample product',exact:false}).click();await page.getByLabel('Creative language',{exact:true}).selectOption(language);await page.getByRole('button',{name:'Create local sample concepts',exact:false}).click();
  await expect(page.getByRole('button',{name:en.creativeSet.create,exact:true})).toBeDisabled();for(const card of await page.getByTestId('concept-card').all())await card.getByRole('button',{name:'Approve concept',exact:false}).click();
  await page.getByRole('button',{name:en.creativeSet.create,exact:true}).click();await expect(page.getByTestId('set-save')).toContainText(en.creativeSet.saved);
  const cards=page.getByTestId('creative-set-card'), images=[];
  for(let index=1;index<=3;index++){
   const button=page.getByRole('button',{name:en.creativeSet.download.replace('{number}',String(index)),exact:true});await expect(button).toBeEnabled();const waiting=page.waitForEvent('download');await button.click();const bytes=await readFile((await(await waiting).path()));expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([1080,1350]);images.push(bytes.toString('base64'));if(mode==='production'&&language==='en')await writeFile(`docs/evidence/creative-set-${index}.png`,bytes);
  }
  expect(new Set(images).size).toBe(3);
  const captionDownload=page.waitForEvent('download');await cards.first().getByRole('button',{name:en.creativeSet.caption,exact:true}).click();const caption=await readFile((await(await captionDownload).path()),'utf8');expect(caption.length).toBeGreaterThan(10);expect(caption).not.toContain('apiKey');
  if(language==='en')await page.locator('.creative-set').screenshot({path:`docs/evidence/creative-set-${mode}-en.png`});
  await cards.first().getByRole('link',{name:en.creativeSet.edit.replace('{number}','1'),exact:false}).click();await expect(page.getByLabel('Layer text',{exact:true})).toBeVisible();const edit=language==='ar'?'عنوان أول محفوظ ومستقل':'Independently retained first design';await page.getByLabel('Layer text',{exact:true}).fill(edit);
  const nav=page.getByRole('navigation',{name:en.creativeSet.switcher,exact:true});for(const index of [2,3]){await nav.getByRole('link',{name:`Creative ${index}`,exact:false}).click();await expect(page.getByRole('button',{name:'Download PNG',exact:false}).first()).toBeEnabled();await expect(page.getByLabel('Layer text',{exact:true})).not.toHaveValue(edit);}
  await nav.getByRole('link',{name:'Creative 1',exact:false}).click();await expect(page.getByLabel('Layer text',{exact:true})).toHaveValue(edit);await page.getByRole('button',{name:'Save now',exact:true}).click();await expect(page.getByTestId('studio-save')).toHaveText('Saved in this browser');await page.reload();await expect(page.getByLabel('Layer text',{exact:true})).toHaveValue(edit);await page.getByRole('button',{name:en.publicMode.lock,exact:true}).click();await expect(page.getByRole('button',{name:'Download PNG',exact:false}).first()).toBeEnabled();
  await page.getByRole('link',{name:'Campaigns',exact:true}).click();await page.getByRole('button',{name:en.creativeSet.create,exact:true}).click();await expect(page.getByTestId('set-save')).toContainText(en.creativeSet.saved);for(let index=1;index<=3;index++)await expect(page.getByRole('button',{name:en.creativeSet.download.replace('{number}',String(index)),exact:true})).toBeEnabled();
  if(language==='ar'){await page.getByRole('button',{name:'Switch to Arabic',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.getByRole('heading',{name:ar.creativeSet.title,exact:true})).toBeVisible();await cards.first().screenshot({path:`docs/evidence/creative-set-${mode}-ar-card.png`});}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const stable=navigations;await page.waitForTimeout(2000);expect(navigations-stable).toBe(0);expect(errors).toEqual([]);expect(paidCalls).toBe(0);
  const health=await(await page.request.get(`${base}/api/health`)).json();expect(health).toMatchObject({milestone:'meta-only-m12',creativeSet:3,serverOwnedKeys:false,sessionKeyLock:true});results.push({language,width,exports:3,captionDownloaded:true,editsRetained:true,unexpectedNavigations:navigations-stable,browserErrors:errors,paidApiCalls:paidCalls});await context.close();
 }
 const result={checkedAtUTC:new Date().toISOString(),base,mode:`local-${mode}-build`,version:'1.0.0',milestone:'meta-only-m12',results,remoteDeploymentVerified:false};await writeFile(`docs/evidence/creative-set-${mode}-smoke.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
