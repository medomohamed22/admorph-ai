// Explicit owner opt-in. Metadata only; never generation, never an alternate provider.
import {mkdir,writeFile} from 'node:fs/promises';

const authorised=process.argv.includes('--allow-catalog'),key=authorised?process.env.ADMORPH_CATALOG_TEST_KEY?.trim():'';
await mkdir('docs/evidence',{recursive:true});
let evidence={checkedAtUTC:new Date().toISOString(),provider:'meta',operation:'catalog',status:'skipped',reason:'Pass --allow-catalog and explicitly provide ADMORPH_CATALOG_TEST_KEY. No request was made.',taskAccessVerified:false,paidGenerationCalls:0};
if(key){try{const {catalogSchema}=await import('../src/lib/ai/schemas.ts');const response=await fetch('http://localhost:3000/api/providers/models',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({providerId:'meta',apiKey:key,consent:true}),signal:AbortSignal.timeout(45000),redirect:'error'});if(!response.ok)throw new Error('catalog_failed');const catalog=catalogSchema.parse(await response.json());if(catalog.models.some(model=>model.provider!=='meta'))throw new Error('invalid_catalog');evidence={...evidence,status:'passed',reason:`Validated ${catalog.models.length} account catalog entries; task capabilities remain unverified.`};}catch{evidence={...evidence,status:'failed',reason:'The explicitly requested Meta catalog check failed. No credential or upstream error is recorded.'};process.exitCode=1;}}
await writeFile('docs/evidence/meta-catalog-check.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
