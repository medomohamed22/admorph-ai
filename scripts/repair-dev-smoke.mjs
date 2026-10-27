import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base=process.env.SMOKE_BASE_URL??'http://localhost:3000';
const en=JSON.parse(await readFile(new URL('../src/messages/en.json',import.meta.url),'utf8'));
const ar=JSON.parse(await readFile(new URL('../src/messages/ar.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  let navigations=0, paidCalls=0;
  page.on('pageerror',error=>errors.push(error.message)); page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.route('**/api/ai/**',route=>{paidCalls++;return route.abort();}); await page.route('**/api/providers/meta-smoke',route=>{paidCalls++;return route.abort();});
  await page.goto(`${base}/campaigns/new`); await page.getByRole('button',{name:'Use sample product',exact:false}).click(); await page.getByLabel('Creative language',{exact:true}).selectOption('ar'); await page.getByRole('button',{name:'Create local sample concepts',exact:false}).click();
  const card=page.getByTestId('concept-card').first(); await card.getByRole('button',{name:'Approve concept',exact:false}).click(); await card.getByRole('link',{name:'Open design editor',exact:false}).click(); await expect(page.getByRole('button',{name:'Download PNG',exact:false}).first()).toBeEnabled();
  await page.getByLabel('Layer text',{exact:true}).fill('عنوان عربي طويل يحتاج إلى مساحة كافية ليظهر داخل التصميم بالكامل دون قص'); await page.getByLabel('Font size',{exact:true}).fill('160'); await page.getByLabel('Layer width',{exact:true}).fill('120'); await page.getByLabel('Layer height',{exact:true}).fill('24'); await page.getByLabel('Text color',{exact:true}).fill('#ffffff'); await page.getByRole('button',{name:'Review design',exact:true}).click(); await expect(page.getByTestId('rule-text_clipped')).toBeVisible(); await expect(page.getByTestId('rule-contrast')).toBeVisible();
  await page.getByRole('button',{name:en.repair.local,exact:true}).click(); await page.getByRole('button',{name:en.repair.preview,exact:true}).click(); await expect(page.getByRole('dialog')).toBeVisible(); const sources=await page.getByRole('dialog').locator('img').evaluateAll(images=>images.map(image=>image.src)); expect(sources).toHaveLength(2); expect(sources[0]).not.toBe(sources[1]); for(const source of sources){const bytes=Buffer.from(source.split(',')[1],'base64');expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([1080,1350]);}
  await page.getByRole('button',{name:en.repair.close,exact:true}).click(); await page.getByRole('button',{name:en.repair.apply,exact:true}).click(); await expect(page.getByTestId('repair-receipt')).toContainText(en.repair.saved); await expect(page.getByTestId('rule-text_clipped')).toHaveCount(0); await expect(page.getByTestId('rule-contrast')).toHaveCount(0);
  await page.reload(); await page.getByRole('tab',{name:'Review',exact:true}).click(); await page.getByRole('button',{name:en.repair.undo,exact:true}).click(); await expect(page.getByTestId('rule-text_clipped')).toBeVisible(); await page.getByRole('button',{name:en.repair.redo,exact:true}).click(); await expect(page.getByTestId('rule-text_clipped')).toHaveCount(0);
  await page.getByRole('button',{name:'Switch to Arabic',exact:true}).click(); await page.setViewportSize({width:320,height:800}); await expect(page.getByRole('button',{name:ar.repair.compare,exact:true})).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const stable=navigations, url=page.url(); await page.waitForTimeout(3500); expect(navigations-stable).toBe(0); expect(page.url()).toBe(url); await expect(page.getByTestId('repair-receipt')).toBeVisible(); expect(errors).toEqual([]); expect(paidCalls).toBe(0);
  const health=await(await page.request.get(`${base}/api/health`)).json(); expect(health.milestone).toBe(7);
  await mkdir('docs/evidence',{recursive:true}); await page.screenshot({path:'docs/evidence/repair-dev-ar.png',fullPage:true});
  const result={checkedAtUTC:new Date().toISOString(),base,mode:'local-development-build',version:'0.7.0',milestone:7,passed:['actual-Arabic-clipping-and-contrast-repair','unchanged-source-preview','two-full-resolution-comparison-PNGs','persisted-receipt-reload-undo-redo','320px-RTL-no-overflow','stable-studio-no-HMR-reload-loop'],unexpectedNavigations:navigations-stable,browserErrors:errors,paidApiCalls:paidCalls,remoteDeploymentVerified:false};
  await writeFile('docs/evidence/repair-dev-smoke.json',JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
} finally {await browser.close();}
