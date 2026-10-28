'use client';
import {MetaTaskPicker} from './meta-task-picker';
import {ImageComparison} from './image-comparison';

/* Local Blob previews must bypass the remote Next image optimizer. */
import {metaFetch} from '@/lib/ai/meta-fetch';

import {requireMetaSuccess,metaErrorMessage} from '@/lib/ai/meta-client-error';
import {useEffect,useState,useRef} from 'react';
import {useCampaign} from './campaign-session';
import {useProviderSession} from './provider-session';
import {useMessages} from './workspace';
import {useObjectUrl} from './logo';
import {getDatabase} from '@/lib/db/dexie';
import {variantSchema,type ProductVariant} from '@/lib/editor/enhancements-schema';
import type {Asset} from '@/lib/db/schema';
import {encodeProduct,validateProduct} from '@/lib/campaign/client';
export function ProductMakeover({ startOpen }: { startOpen?: boolean }){
 const session=useCampaign(),provider=useProviderSession(),t=useMessages().meta,mode='enhance',[preset,setPreset]=useState<'clean'|'luxury'|'lifestyle'|'minimal'>('clean'),[prompt,setPrompt]=useState(''),[rows,setRows]=useState<ProductVariant[]>([]),[candidate,setCandidate]=useState<{blob:Blob;sample:boolean;scope:string}|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');const abort=useRef<AbortController|null>(null),draft=session.draft;
 const originalId=draft?.originalProductAssetId??draft?.productAssetId,original=session.assets.find(asset=>asset.id===originalId),url=useObjectUrl(original?.blob??null),after=useObjectUrl(candidate?.blob??null),savedModel=provider.taskModel('image_edit')??provider.taskModel('image');
 const [choice,setChoice]=useState<string|null>(null),modelId=choice??savedModel?.modelId??'',model=modelId?{modelId}:null,key=provider.configs.meta.apiKey.trim();
 const campaignId=draft?.id,scope=JSON.stringify([campaignId,originalId,mode,preset,prompt,model?.modelId,provider.keyEpoch]);
 useEffect(()=>{let alive=true;if(campaignId)Promise.resolve().then(()=>getDatabase().productVariants.where('campaignId').equals(campaignId).toArray()).then(values=>{if(alive)setRows(values);}).catch(()=>{});return()=>{alive=false;};},[campaignId]);
 useEffect(()=>()=>abort.current?.abort(),[draft?.id,originalId,provider.keyEpoch]);
 async function generate(sample:boolean){if(!original)return;setBusy(true);setNotice('');const controller=new AbortController();abort.current=controller;try{let blob:Blob;
 if(sample){const image=await createImageBitmap(original.blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.filter='brightness(1.08) contrast(1.04)';ctx.drawImage(image,0,0);image.close();blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(),'image/png'));}
 else{if(!model||!consent||!key)return;const response=await metaFetch('image_edit','/api/ai/product-makeover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({providerId:'meta',apiKey:provider.configs.meta.apiKey,modelId:model.modelId,consent:true,imageConsent:true,image:await encodeProduct(original.blob),mode,preset,prompt}),signal:controller.signal});await requireMetaSuccess(response);blob=await response.blob();await validateProduct(blob);}
 await validateProduct(blob);if(!controller.signal.aborted)setCandidate({blob,sample,scope});}catch(error){setNotice(metaErrorMessage(error,t));}finally{setBusy(false);setConsent(false);}}
 async function accept(){if(!candidate||candidate.scope!==scope||!draft||!original)return;setBusy(true);const asset:Asset={id:crypto.randomUUID(),kind:'product',blob:candidate.blob,createdAt:new Date().toISOString()},row=variantSchema.parse({id:crypto.randomUUID(),assetId:asset.id,originalAssetId:original.id,campaignId:draft.id,mode:candidate.sample?'sample':mode,preset,modelId:candidate.sample?null:model?.modelId,prompt,approved:true,createdAt:asset.createdAt});try{await getDatabase().transaction('rw',getDatabase().assets,getDatabase().productVariants,async()=>{await getDatabase().assets.put(asset);await getDatabase().productVariants.put(row);});setRows(previous=>[row,...previous]);session.chooseProduct(asset,row.id,original.id);setCandidate(null);setNotice(t.variantSaved);}catch{setNotice(t.storageProblem);}finally{setBusy(false);}}
 async function choose(row:ProductVariant){try{const asset=session.assets.find(value=>value.id===row.assetId)??await getDatabase().assets.get(row.assetId);if(asset&&original)session.chooseProduct(asset,row.id,original.id);}catch{setNotice(t.storageProblem);}}
 async function remove(row:ProductVariant){try{await getDatabase().productVariants.delete(row.id);if(draft?.activeVariantId===row.id&&original)session.chooseProduct(original,null,original.id);setRows(previous=>previous.filter(value=>value.id!==row.id));}catch{setNotice(t.storageProblem);}/* Keep immutable asset Blobs: saved creatives/history may reference them. */}
 if(!draft||!original)return null;
 return <details className="feature-card" open={startOpen}><summary>{t.makeover}</summary><p>{t.originalKept}</p><button type="button" className="button secondary" onClick={()=>session.chooseProduct(original,null,original.id)}>{t.useOriginal}</button><p>{t.enhanceOnly}</p><label>{t.preset}<select value={preset} onChange={e=>setPreset(e.target.value as typeof preset)}>{['clean','luxury','lifestyle','minimal'].map((value,index)=><option value={value} key={value}>{t.presets[index]}</option>)}</select></label><label>{t.prompt}<textarea maxLength={1000} value={prompt} onChange={e=>setPrompt(e.target.value)}/></label><p>{t.editRequirement}</p><MetaTaskPicker task="image_edit" value={modelId} onChange={value=>{setChoice(value);setConsent(false);abort.current?.abort();}}/>{!key&&<p>{t.errors.missing_key}</p>}<p>{t.packagingRisk}</p><label className="check-label"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>{t.shareImage}</label><button type="button" className="button secondary" disabled={!model||!key||!consent||busy} onClick={()=>void generate(false)}>{t.generateVariant}</button><button type="button" className="text-button" disabled={busy} onClick={()=>void generate(true)}>{t.localSample}</button>
 {candidate&&candidate.scope===scope&&<article data-testid="makeover-comparison"><strong>{candidate.sample?t.sample:t.metaSuggestion}</strong><ImageComparison before={url} after={after} beforeLabel={t.original} afterLabel={t.variant}/><button type="button" className="button primary" disabled={busy} onClick={()=>void accept()}>{t.acceptVariant}</button><button type="button" className="text-button" onClick={()=>setCandidate(null)}>{t.reject}</button></article>}
 {rows.filter(row=>row.originalAssetId===originalId).map(row=><div key={row.id}><strong>{row.mode==='sample'?t.sample:t.variant}</strong><button type="button" className="text-button" onClick={()=>void choose(row)}>{t.useVariant}</button><button type="button" className="text-button" onClick={()=>void remove(row)}>{t.deleteVariant}</button></div>)}{notice&&<p role="status">{notice}</p>}</details>;
}
