'use client';
/* These local Blob previews must bypass the remote Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
import {useEffect,useState} from 'react';
import {defaultLogoPlacement,logoPositions,logoBox,logoPlacementSchema} from '@/lib/editor/logo-placement';
import {z} from 'zod';
import {useObjectUrl} from './logo';
import {useMessages} from './workspace';
export function LogoOptions({value,onChange,blob,onAspect}:{value:z.infer<typeof logoPlacementSchema>;onChange:(value:z.infer<typeof logoPlacementSchema>)=>void;blob:Blob|null;onAspect?:(ratio:number)=>void}){
 const t=useMessages().meta,url=useObjectUrl(blob),[ratio,setRatio]=useState(1);useEffect(()=>{let alive=true;if(url){const image=new Image();image.src=url;image.decode().then(()=>{if(alive){const next=image.naturalWidth/image.naturalHeight;setRatio(next);onAspect?.(next);}}).catch(()=>{});}return()=>{alive=false;};},[url,onAspect]);
 const box=logoBox(value,ratio);
 return <fieldset className="logo-options"><legend>{t.logoTitle}</legend><label><input type="checkbox" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>{t.logoAuto}</label>
 <label>{t.position}<select aria-label={t.position} value={value.position} onChange={e=>onChange({...value,position:e.target.value as typeof value.position})}>{logoPositions.map((position,index)=><option key={position} value={position}>{t.positions[index]}</option>)}</select></label>
 {(['widthPercent','marginPercent','opacity'] as const).map(field=><label key={field}>{t[field]}<input type="range" aria-label={t[field]} min={field==='widthPercent'?8:field==='marginPercent'?2:0} max={field==='widthPercent'?35:field==='marginPercent'?15:1} step={field==='opacity'?.05:1} value={value[field]} onChange={e=>onChange({...value,[field]:Number(e.target.value)})}/><output>{value[field]}</output></label>)}
 <div className="logo-placement-preview" aria-label={t.logoPreview}>{url&&value.enabled&&<img src={url} alt={t.logoTitle} style={{position:'absolute',left:`${box.x/1080*100}%`,top:`${box.y/1350*100}%`,width:`${box.width/1080*100}%`,height:`${box.height/1350*100}%`,opacity:box.opacity,objectFit:'contain'}}/>}</div><button type="button" className="text-button" onClick={()=>onChange({...defaultLogoPlacement})}>{t.reset}</button></fieldset>;
}
