import { mkdir, writeFile } from 'node:fs/promises';
const target=new URL(process.argv[2]??''), local=process.argv.includes('--local');
if(target.username||target.password||target.search||target.hash||target.pathname!=='/'||(!local&&target.protocol!=='https:')||(local&&(!['localhost','127.0.0.1'].includes(target.hostname)||!['http:','https:'].includes(target.protocol))))throw new Error('Use an HTTPS site origin without credentials, query or path. --local permits localhost only.');
const base=target.origin,checked=[];
for(const path of ['/api/health','/','/campaigns/new','/settings','/hackathon']){
 const response=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store',credentials:'omit'});
 if(response.status!==200)throw new Error(`${path} returned ${response.status}; check deployment access/protection.`);
 if(response.headers.get('x-content-type-options')!=='nosniff'||response.headers.get('x-frame-options')!=='DENY')throw new Error(`${path}: expected application security headers missing.`);
 if(path==='/api/health'){const health=await response.json();if(health.status!=='ok'||health.milestone!=='meta-only-m12'||health.serverOwnedKeys!==false||health.creativeSet!==3)throw new Error('Unexpected application/milestone at target origin.');}else await response.body?.cancel();
 checked.push({path,status:response.status});
}
for(const path of ['/api/ai/plan','/api/ai/background','/api/ai/critic','/api/ai/repairs','/api/providers/meta-smoke','/api/ai/brand-extract','/api/ai/shift-copy','/api/ai/product-makeover','/api/providers/task-test','/api/providers/models','/api/providers/test']){
 const response=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(15000),credentials:'omit'});
 if(response.status!==400||!response.headers.get('cache-control')?.includes('no-store'))throw new Error(`${path}: missing-input guard failed.`);await response.body?.cancel();checked.push({path,status:response.status});
}
const result={checkedAtUTC:new Date().toISOString(),base,mode:local?'local-production-http-check':'public-deployment-http-check',checked,paidApiCalls:false,remoteDeploymentVerified:!local,limitations:'HTTP routes/guards only. Browser storage, mobile rendering and authenticated generation need separate verification.'};
await mkdir('docs/evidence',{recursive:true});await writeFile(`docs/evidence/${local?'release-local-http':'deployed-site-smoke'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
