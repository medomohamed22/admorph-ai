import { clampLayer, creativeSchema, type Creative, type EditableLayer } from '../editor/schema';
import { dimensionsFor } from '../editor/sizes';
import { checkCreative, intersects, fingerprint } from '../critic/rules';
import type { RuleResult, TextMetrics } from '../critic/schema';
import { contrastRatio } from '../editor/checks';
import { ctaBrandPair } from '../editor/brand-colors';
import { repairResponseSchema, repairReceiptSchema, type RepairAction, type RepairReceipt } from './schema';
import {occlusion,safeZones} from '../editor/safe-zones';
export type Measure = (layers: EditableLayer[]) => TextMetrics;
const textKinds = ['headline', 'brand', 'cta'];
export function applyActions(creative: Creative, actions: RepairAction[]): Creative {
  const parsed = repairResponseSchema.parse({ rationale: 'Validated repair', actions });
  const next = structuredClone(creativeSchema.parse(creative));
  if (new Set(next.layers.map(layer => layer.id)).size !== next.layers.length) throw new Error('repair_invalid');
  for (const action of parsed.actions) {
    const index = next.layers.findIndex(layer => layer.id === action.layerId);
    if (index < 0) throw new Error('repair_invalid');
    const layer = next.layers[index];
    if (layer.kind === 'background' && ['move_layer', 'resize_layer'].includes(action.type)) throw new Error('repair_invalid');
    if (['set_color', 'set_font_size', 'set_text', 'add_backdrop', 'show_layer', 'set_direction'].includes(action.type) && !textKinds.includes(layer.kind)) throw new Error('repair_invalid');
    const patch: Partial<EditableLayer> = action.type === 'move_layer' ? { x: action.x, y: action.y } : action.type === 'resize_layer' ? { width: action.width, height: action.height } : action.type === 'set_color' ? { color: action.color } : action.type === 'set_font_size' ? { fontSize: action.fontSize } : action.type === 'set_text' ? { text: action.text } : action.type === 'add_backdrop' ? { fill: action.color } : action.type === 'set_direction' ? { dir: action.dir } : { visible: true };
    next.layers[index] = clampLayer(layer, patch, dimensionsFor(next.format));
  }
  return creativeSchema.parse(next);
}
export function validateReceipt(record: RepairReceipt): RepairReceipt {
  const valid = repairReceiptSchema.parse(record);
  if (fingerprint(applyActions(valid.before, valid.actions)) !== fingerprint(valid.after)) throw new Error('repair_invalid');
  return valid;
}
export function layerChanges(before: Creative, after: Creative) {
  const properties = ['x', 'y', 'width', 'height', 'text', 'color', 'fill', 'fontSize', 'visible'] as const;
  return before.layers.flatMap(layer => {
    const next = after.layers.find(item => item.id === layer.id)!;
    return properties.flatMap(property => layer[property] === next[property] ? [] : [{ layerId: layer.id, kind: layer.kind, property, before: layer[property], after: next[property] }]);
  });
}
export function proposeLocal(creative: Creative, measure: Measure, assetIds: Set<string>, brandColors?: readonly string[]): RepairAction[] {
  let draft = structuredClone(creative); const actions: RepairAction[] = [];
  const dims = dimensionsFor(draft.format);
  const add = (action: RepairAction) => { if (actions.length < 16) { draft = applyActions(draft, [action]); actions.push(action); } };
  const initial = checkCreative(draft, measure(draft.layers), assetIds, dims, brandColors);
  for (const issue of initial.issues) {
    const layer = draft.layers.find(item => item.id === issue.layerIds[0]); if (!layer) continue;
    if (issue.code === 'copy_missing' && layer.text.trim() && !layer.visible) add({ type: 'show_layer', layerId: layer.id });
    if (issue.code === 'direction_mismatch' && layer.dir && layer.dir !== 'auto') add({ type: 'set_direction', layerId: layer.id, dir: 'auto' });
    if (issue.code === 'cta_off_brand' && brandColors) {
      const pair = ctaBrandPair(brandColors);
      if (pair.fill !== layer.fill) add({ type: 'add_backdrop', layerId: layer.id, color: pair.fill });
      if (pair.color !== layer.color) add({ type: 'set_color', layerId: layer.id, color: pair.color });
    }
    if (issue.code === 'text_clipped') {
      const width = Math.max(layer.width, Math.min(930, dims.width - layer.x - 24));
      const blockers = draft.layers.filter(other => other.visible && other.id !== layer.id && other.kind !== 'background' && other.y >= layer.y + 24 && intersects({ ...layer, width, height: dims.height - layer.y }, other));
      const bottom = Math.min(dims.height - 24, ...blockers.map(other => other.y - 24));
      const height = Math.max(layer.height, Math.max(24, bottom - layer.y));
      if (width !== layer.width || height !== layer.height) add({ type: 'resize_layer', layerId: layer.id, width, height });
      const resized = draft.layers.find(item => item.id === layer.id)!;
      let low = 12, high = Math.floor(resized.fontSize), fit = 0;
      // Bounded local measurements, not model calls or a paid review loop.
      while (low <= high) { const mid = Math.floor((low + high) / 2); const measured = measure(draft.layers.map(item => item.id === layer.id ? { ...item, fontSize: mid } : item))[layer.id];
        if (measured && !measured.unrenderable && measured.neededHeight <= resized.height) { fit = mid; low = mid + 1; } else high = mid - 1;
      }
      if (fit && fit !== resized.fontSize) add({ type: 'set_font_size', layerId: layer.id, fontSize: fit });
    }
    if (issue.code === 'contrast') {
      const color = contrastRatio('#000000', layer.fill) >= contrastRatio('#ffffff', layer.fill) ? '#000000' : '#ffffff';
      if (color !== layer.color) add({ type: 'set_color', layerId: layer.id, color });
    }
  }
  for (const issue of checkCreative(draft, measure(draft.layers), assetIds, dims).issues.filter(item => item.code === 'logo_overlap')) {
    const logo = draft.layers.find(item => item.id === issue.layerIds[0])!;
    const positions = [{ x: dims.width - 40 - logo.width, y: 40 }, { x: 40, y: 40 }, { x: dims.width - 40 - logo.width, y: dims.height - 40 - logo.height }, { x: 40, y: dims.height - 40 - logo.height }];
    const position = positions.map(point => clampLayer(logo, point, dims)).find(point => !draft.layers.some(other => other.visible && other.id !== logo.id && other.kind !== 'background' && intersects(point, other)));
    if (position) add({ type: 'move_layer', layerId: logo.id, x: position.x, y: position.y });
  }
  for (const issue of checkCreative(draft, measure(draft.layers), assetIds, dims).issues.filter(item => item.code === 'contrast')) {
    const layer = draft.layers.find(item => item.id === issue.layerIds[0])!;
    const color = contrastRatio('#000000', layer.fill) >= contrastRatio('#ffffff', layer.fill) ? '#000000' : '#ffffff';
    if (color !== layer.color) add({ type: 'set_color', layerId: layer.id, color });
  }
  for(const issue of checkCreative(draft,measure(draft.layers),assetIds,dims).issues.filter(item=>item.code==='meta_ui_occlusion'||item.code==='logo_product_overlap')){
    const layer=draft.layers.find(item=>item.id===issue.layerIds[0])!;
    const ys=[120,Math.max(120,dims.height-140-layer.height-10),Math.max(120,dims.height-270-layer.height),300,500];
    const xs=[layer.x,40,dims.width-layer.width-40,(dims.width-layer.width)/2];
    const candidates=ys.flatMap(y=>xs.map(x=>clampLayer(layer,{x,y},dims))).sort((a,b)=>Math.hypot(a.x-layer.x,a.y-layer.y)-Math.hypot(b.x-layer.x,b.y-layer.y));
    const target=candidates.find(candidate=>occlusion(candidate,safeZones(draft.placement??'off',dims.width,dims.height))<=.15&&!draft.layers.some(other=>other.visible&&other.id!==layer.id&&other.kind!=='background'&&intersects(candidate,other)));
    if(target)add({type:'move_layer',layerId:layer.id,x:target.x,y:target.y});
  }
  return actions;
}
export function hasRegression(before: RuleResult, after: RuleResult): boolean {
  for (const issue of after.issues) {
    const old = before.issues.find(item => item.id === issue.id);
    if (!old) return true;
    if (issue.code === 'contrast' && Number(issue.evidence.ratio) + .01 < Number(old.evidence.ratio)) return true;
    if (issue.code === 'text_clipped' && Number(issue.evidence.needed) - Number(issue.evidence.available) > Number(old.evidence.needed) - Number(old.evidence.available) + 1) return true;
  }
  return false;
}
export function verifyRepair(before: Creative, after: Creative, measure: Measure, assetIds: Set<string>) {
  const oldMetrics = measure(before.layers), newMetrics = measure(after.layers);
  const original = checkCreative(before, oldMetrics, assetIds, dimensionsFor(before.format)), result = checkCreative(after, newMetrics, assetIds, dimensionsFor(after.format));
  const lostGlyphs = Object.entries(newMetrics).some(([id, value]) => value.unrenderable && !oldMetrics[id]?.unrenderable);
  const area = (a: EditableLayer, b: EditableLayer) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const largerOverlap = result.issues.filter(issue => issue.code === 'logo_overlap').some(issue => {
    const [a, b] = issue.layerIds; return area(after.layers.find(layer => layer.id === a)!, after.layers.find(layer => layer.id === b)!) > area(before.layers.find(layer => layer.id === a)!, before.layers.find(layer => layer.id === b)!) + 1;
  });
  const worseOcclusion=result.issues.filter(issue=>issue.code==='meta_ui_occlusion').some(issue=>{const id=issue.layerIds[0],a=after.layers.find(layer=>layer.id===id),b=before.layers.find(layer=>layer.id===id);return !!a&&!!b&&occlusion(a,safeZones(after.placement??'off',dimensionsFor(after.format).width,dimensionsFor(after.format).height))>occlusion(b,safeZones(before.placement??'off',dimensionsFor(before.format).width,dimensionsFor(before.format).height))+.001;});
  return { before: original, after: result, regression: hasRegression(original, result) || lostGlyphs || largerOverlap || worseOcclusion };
}
