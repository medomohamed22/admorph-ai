'use client';
/* These local Blob previews must bypass the remote Next image optimizer. */
import {ImageComparison} from './image-comparison';
import {useState} from 'react';
import {useMessages} from './workspace';
import {useStudio} from './studio-session';
import type {Finding} from '@/lib/critic/schema';
import type {Creative} from '@/lib/editor/schema';
import type {CanvasHandle} from './design-canvas';
import {proposeLocal,applyActions,verifyRepair} from '@/lib/repair/engine';
import {fingerprint} from '@/lib/critic/rules';
export function IssueFix({issue,creative,handle,onClose}:{issue:Finding;creative:Creative;handle:React.RefObject<CanvasHandle|null>;onClose:()=>void}){
 const m=useMessages(),t=m.meta,studio=useStudio(),[proposal,setProposal]=useState<{before:Creative;after:Creative;images:string[];regression:boolean}|null>(null),[error,setError]=useState('');
 function prepare(){if(!handle.current)return;try{const ids=new Set(studio.assets.map(asset=>asset.id)),measure=(layers:Creative['layers'])=>handle.current!.measureText(layers),actions=proposeLocal(creative,measure,ids).filter(action=>issue.layerIds.includes(action.layerId));if(!actions.length){setError(t.manualNeeded);return;}const after=applyActions(creative,actions),checked=verifyRepair(creative,after,measure,ids);setProposal({before:creative,after,images:[handle.current.renderLayers(creative.layers),handle.current.renderLayers(after.layers)],regression:checked.regression});}catch{setError(t.manualNeeded);}}
 return <section className="issue-popover feature-card" role="dialog" aria-label={t.issueDetails}><h3>{m.critic.rules[issue.code].title}</h3><p>{Object.entries(issue.evidence).reduce((text,[key,value])=>text.replaceAll('{'+key+'}',String(value)),m.critic.rules[issue.code].explanation)}</p><button className="text-button" onClick={prepare}>{t.fixElement}</button>{proposal&&<><ImageComparison before={proposal.images[0]} after={proposal.images[1]} beforeLabel={t.before} afterLabel={t.after}/><button className="button primary" disabled={proposal.regression||fingerprint(proposal.before)!==fingerprint(creative)} onClick={()=>{studio.update(proposal.after);onClose();}}>{t.approveFix}</button></>}{error&&<p>{error}</p>}<button className="text-button" onClick={onClose}>{t.close}</button></section>;
}
