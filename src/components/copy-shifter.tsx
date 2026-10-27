'use client';
import {metaFetch} from '@/lib/ai/meta-fetch';

import {requireMetaSuccess,metaErrorMessage} from '@/lib/ai/meta-client-error';
import {useState,useEffect,useRef} from 'react';
import {dialectSchema,shiftedSchema} from '@/lib/ai/meta-contracts';
import {z} from 'zod';
import {useMessages} from './workspace';
import {useProviderSession} from './provider-session';
type Copy=z.infer<typeof shiftedSchema>&{locale?:z.infer<typeof dialectSchema>};
export function CopyShifter({headline,caption,brief,onAccept,measure,contextKey}:{headline:string;caption:string;brief:string;onAccept:(value:Copy)=>void;contextKey?:string;measure:(value:Copy)=>Promise<boolean>}){
 const t=useMessages().meta,session=useProviderSession(),[dialect,setDialect]=useState<z.infer<typeof dialectSchema>>('ar_msa'),[limit,setLimit]=useState(60),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[proposal,setProposal]=useState<{copy:Copy;fits:boolean;sample:boolean;signature:string}|null>(null),[error,setError]=useState('');const abort=useRef<AbortController|null>(null);
 const model=session.taskModel('copy'),signature=JSON.stringify([headline,caption,brief,dialect,limit,contextKey,model?.modelId,session.keyEpoch,session.configs.meta.apiKey]);useEffect(()=>()=>abort.current?.abort(),[signature,session.keyEpoch]);
 async function propose(sample:boolean){const controller=new AbortController();abort.current=controller;setBusy(true);setError('');try{let copy:Copy;
 if(sample){const words={ar_msa:'لحظة تناسب يومك',ar_eg:'لحظة على مزاجك',ar_gulf:'لحظة على ذوقك',ar_lev:'لحظة بتلبقلك',en_direct:'Explore the details',en_genz:'Your moment, your way',en_luxury:'A considered daily ritual'};copy={headline:words[dialect].slice(0,limit),caption,ctaText:dialect.startsWith('ar')?'اكتشف المزيد':'Explore more',culturalNote:t.sampleReason};}
 else{if(!model||!consent)return;const response=await metaFetch('copy','/api/ai/shift-copy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({providerId:'meta',apiKey:session.configs.meta.apiKey,modelId:model.modelId,consent:true,currentHeadline:headline,currentCaption:caption,productBrief:brief,targetLocale:dialect,maxHeadlineChars:limit}),signal:controller.signal});await requireMetaSuccess(response);copy=shiftedSchema.parse(await response.json());}
 copy.locale=dialect;const fits=await measure(copy);if(!controller.signal.aborted)setProposal({copy,fits,sample,signature});}catch(error){if(!controller.signal.aborted)setError(metaErrorMessage(error,t));}finally{setBusy(false);setConsent(false);}}
 return <details className="feature-card"><summary>{t.copyTitle}</summary><label>{t.dialect}<select aria-label={t.dialect} value={dialect} onChange={e=>setDialect(e.target.value as typeof dialect)}>{dialectSchema.options.map((value,index)=><option key={value} value={value}>{t.dialects[index]}</option>)}</select></label><label>{t.maxChars}<input type="number" aria-label={t.maxChars} min={15} max={90} value={limit} onChange={e=>setLimit(Math.max(15,Math.min(90,Number(e.target.value))))}/></label>
 <label className="check-label"><input type="checkbox" checked={consent} disabled={busy||!model||!session.configs.meta.apiKey} onChange={e=>setConsent(e.target.checked)}/>{t.paidConsent}</label><button type="button" className="button secondary" disabled={busy||!model||!consent} onClick={()=>void propose(false)}>{t.shift}</button><button type="button" className="text-button" disabled={busy} onClick={()=>void propose(true)}>{t.localSample}</button>
 {proposal&&<article data-testid="copy-proposal"><strong>{proposal.sample?t.sample:t.metaSuggestion}</strong><p>{headline} → {proposal.copy.headline}</p><p>{proposal.copy.caption}</p><p>{proposal.copy.ctaText}</p><p>{proposal.copy.culturalNote}</p>{!proposal.fits&&<p role="alert">{t.copyClipped}</p>}<button type="button" className="button primary" disabled={!proposal.fits||proposal.signature!==signature} onClick={()=>{onAccept(proposal.copy);setProposal(null);}}>{t.applyCopy}</button></article>}{error&&<p role="alert">{error}</p>}</details>;
}
