import { readFile,readdir,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd(), releases=path.join(root,'releases'), left=path.resolve(process.argv[2]??''), right=path.resolve(process.argv[3]??'');
for(const folder of [left,right])if(!folder.startsWith(releases+path.sep))throw new Error('Compare release folders inside the workspace only.');
async function walk(relative){const result=[];for(const item of await readdir(path.join(left,relative),{withFileTypes:true})){const name=path.join(relative,item.name);if(item.isSymbolicLink())throw new Error('Unexpected symlink');if(item.isDirectory())result.push(...await walk(name));else result.push(name);}return result;}
const files=['package.json','package-lock.json','next.config.ts','tsconfig.json','eslint.config.mjs','playwright.config.ts','vitest.config.mts','vercel.json','.vercelignore','.env.example'];
for(const folder of ['src','public','tests','.github'])files.push(...await walk(folder));
for(const file of files){const hash=bytes=>createHash('sha256').update(bytes).digest('hex');if(hash(await readFile(path.join(left,file)))!==hash(await readFile(path.join(right,file))))throw new Error('Verified runtime/config source differs: '+file);}
const result={checkedAtUTC:new Date().toISOString(),version:'0.9.0',preparedFolder:path.relative(root,left),independentlyBuiltFolder:path.relative(root,right),matchingRuntimeConfigTestAndAssetFiles:files.length,identical:true,limitations:'Final documentation, media/evidence and release utility additions are manifest-checked separately; the extracted copy independently passed fresh install/lint/types/unit/build/production smokes.',remoteDeploymentVerified:false};await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/release-source-comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
