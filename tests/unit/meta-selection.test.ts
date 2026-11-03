import {it,expect} from 'vitest';
import {metaModelId} from '../../src/lib/ai/model-id';
import {metaBase} from '../../src/lib/ai/meta-contracts';
import {planRequestSchema,newCampaign} from '../../src/lib/campaign/schema';
it('preserves exact namespaced and colon IDs consistently while rejecting traversal and URL injection',()=>{for(const id of ['team/model:1','muse-spark-1.3','x'.repeat(240)]){expect(metaModelId.parse(id)).toBe(id);expect(metaBase.parse({providerId:'meta',apiKey:'fixture',modelId:id,consent:true}).modelId).toBe(id);const base={providerId:'meta',apiKey:'fixture',modelId:id,consent:true,imageConsent:true,brand:newCampaign().brandSnapshot,brief:'Valid brief',goal:'awareness',creativeLanguage:'en',format:'1080x1350',product:{mimeType:'image/png',data:'aGVsbG8='}};expect(planRequestSchema.parse(base).modelId).toBe(id);}for(const id of ['../evil','team/../evil','team//model','x?key=secret','x'.repeat(241)])expect(metaModelId.safeParse(id).success).toBe(false);});
