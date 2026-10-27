import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { buildCreativeSet, readCreativeSet, saveCreativeSet } from '../../src/lib/editor/set';
import { creativeSchema } from '../../src/lib/editor/schema';
import { AdMorphDB } from '../../src/lib/db/dexie';
import { handlePlanRequest } from '../../src/lib/ai/planning-server';
import { handleBackgroundRequest } from '../../src/lib/ai/image-server';
import { handleCriticRequest } from '../../src/lib/ai/critic-server';
import { handleRepairRequest } from '../../src/lib/ai/repair-server';
import { handleMetaSmoke } from '../../src/lib/ai/meta-smoke-server';
function fixture() {
  const product = {id:crypto.randomUUID(),kind:'product' as const,blob:new Blob(['synthetic product']),createdAt:new Date().toISOString()};
  const campaign = {...newCampaign(), productAssetId:product.id, planRevision:0};
  campaign.concepts = samplePlan(campaign).concepts.map(item=>({...item,id:crypto.randomUUID(),approved:true})); return {campaign,product};
}
describe('independent creative set',()=>{
  it('builds three distinct bounded editable templates and independent owned assets',()=>{
    const {campaign,product}=fixture(), entries=buildCreativeSet(campaign,product,null,[]);
    expect(entries).toHaveLength(3); for(const entry of entries)expect(creativeSchema.safeParse(entry.creative).success).toBe(true);
    expect(new Set(entries.map(entry=>entry.creative.id)).size).toBe(3);expect(new Set(entries.map(entry=>entry.assets[0].id)).size).toBe(3);expect(entries.every(entry=>entry.assets[0].id!==product.id&&entry.assets[0].blob===product.blob)).toBe(true);
    expect(new Set(entries.map(entry=>JSON.stringify(entry.creative.layers.find(layer=>layer.kind==='product')))).size).toBe(3);
    expect(entries.map(entry=>entry.creative.caption)).toEqual(campaign.concepts.map(item=>item.caption));
  });
  it('retains saved edits, source and identities when preparing again',()=>{
    const {campaign,product}=fixture(), entries=buildCreativeSet(campaign,product,null,[]);entries[1].creative.caption='Edited caption';entries[1].creative.layers.find(layer=>layer.kind==='headline')!.text='My retained headline';
    const again=buildCreativeSet(campaign,product,null,entries);expect(again.map(item=>item.creative)).toEqual(entries.map(item=>item.creative));expect(again[1].creative.layers.find(layer=>layer.kind==='headline')?.text).toBe('My retained headline');
  });
  it('refuses incomplete approval, stale inputs or a mismatched product',()=>{
    const {campaign,product}=fixture();expect(()=>buildCreativeSet({...campaign,concepts:campaign.concepts.map((item,index)=>({...item,approved:index!==2}))},product,null,[])).toThrow('approval_required');
    expect(()=>buildCreativeSet({...campaign,planRevision:null},product,null,[])).toThrow();expect(()=>buildCreativeSet(campaign,{...product,id:crypto.randomUUID()},null,[])).toThrow('approval_required');
  });
  it('saves and reloads the complete set without depending on the campaign product Blob',async()=>{
    const {campaign,product}=fixture(),db=new AdMorphDB(`set-${crypto.randomUUID()}`),entries=buildCreativeSet(campaign,product,null,[]);
    try{await saveCreativeSet(entries,db);expect(await db.creatives.count()).toBe(3);expect(await db.assets.get(product.id)).toBeUndefined();const loaded=await readCreativeSet(campaign,db);expect(loaded.map(item=>item.creative)).toEqual(entries.map(item=>item.creative));expect(loaded.every(item=>item.assets.length===1)).toBe(true);}finally{await db.delete();}
  });
  it('rolls back the entire set if one creative references a missing image',async()=>{
    const {campaign,product}=fixture(),db=new AdMorphDB(`set-rollback-${crypto.randomUUID()}`),entries=buildCreativeSet(campaign,product,null,[]);entries[2].assets=[];
    try{await expect(saveCreativeSet(entries,db)).rejects.toThrow('missing_asset');expect(await db.creatives.count()).toBe(0);expect(await db.assets.count()).toBe(0);}finally{await db.delete();}
  });
  it('renders the Arabic set as editable Cairo copy rather than a flattened text image',()=>{
    const {campaign,product}=fixture();campaign.creativeLanguage='ar';campaign.concepts=samplePlan(campaign).concepts.map(item=>({...item,id:crypto.randomUUID(),approved:true}));
    const entries=buildCreativeSet(campaign,product,null,[]);expect(entries.every(entry=>entry.creative.layers.find(layer=>layer.kind==='headline')?.fontFamily==='Cairo')).toBe(true);expect(entries.map(entry=>entry.creative.layers.find(layer=>layer.kind==='headline')?.text)).toEqual(campaign.concepts.map(item=>item.headline));
  });
});
it('never falls back to owner environment keys on public generation routes',async()=>{
  vi.stubEnv('GEMINI_API_KEY','synthetic-owner-key-not-real');vi.stubEnv('META_API_KEY','synthetic-owner-key-not-real');const fetcher=vi.fn();
  try{for(const [path,handle] of [['plan',handlePlanRequest],['background',handleBackgroundRequest],['critic',handleCriticRequest],['repairs',handleRepairRequest],['meta-smoke',handleMetaSmoke]] as const){const response=await handle(new Request(`https://app.test/api/ai/${path}`,{method:'POST',headers:{Origin:'https://app.test','Content-Type':'application/json'},body:'{}'}),{fetcher});expect(response.status).toBe(400);expect(await response.text()).not.toContain('synthetic-owner-key-not-real');}expect(fetcher).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}
});
