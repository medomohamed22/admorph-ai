'use client';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Stage, Layer, Rect, Circle, Text, Image as KonvaImage, Group, Transformer } from 'react-konva';
import type Konva from 'konva';
import { clampLayer, type EditableLayer } from '@/lib/editor/schema';
import { resolveLayerDirection } from '@/lib/editor/direction';
import { fitContain } from '@/lib/editor/fit';
import type { Asset } from '@/lib/db/schema';
import { useObjectUrl } from './logo';
import {safeZones} from '@/lib/editor/safe-zones';
import type {Finding} from '@/lib/critic/schema';
import type { TextMetrics } from '@/lib/critic/schema';

function Raster({ blob, id, width, height, cover = false, onReady }: { blob: Blob; id: string; width: number; height: number; cover?: boolean; onReady: (id: string) => void }) {
  const url = useObjectUrl(blob); const [image, setImage] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!url) return; let alive = true; const next = new window.Image(); next.src = url;
    next.decode().then(() => { if (alive) { setImage(next); onReady(id); } }).catch(() => {});
    return () => { alive = false; };
  }, [url, onReady, id]);
  if (!image) return null;
  if (cover) {
    const ratio = Math.max(width / image.width, height / image.height);
    return <KonvaImage image={image} x={(width - image.width * ratio) / 2} y={(height - image.height * ratio) / 2} width={image.width * ratio} height={image.height * ratio} listening={false}/>;
  }
  const fitted = fitContain({ width, height }, image.width, image.height);
  return <KonvaImage image={image} x={fitted.x} y={fitted.y} width={fitted.width} height={fitted.height} listening={false}/>;
}
export type CanvasHandle = { exportPng: () => string; measureText: (candidate?: EditableLayer[]) => TextMetrics; renderLayers: (candidate: EditableLayer[]) => string };
export default function DesignCanvas({ layers, assets, selected, select, patch, zoom, handle, ready, onReady, label, disabled, placement = 'off', findings = [], onIssue }: {
  layers: EditableLayer[]; assets: Asset[]; selected: string | null; select: (id: string | null) => void;
  patch: (id: string, values: Partial<EditableLayer>) => void; zoom: number; handle: React.RefObject<CanvasHandle | null>;
  placement?:string; findings?:Finding[]; onIssue?:(issue:Finding)=>void; ready: boolean; onReady: (id: string) => void; label: string; rtl: boolean; disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), stage = useRef<Konva.Stage>(null), transformer = useRef<Konva.Transformer>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => { if (!host.current) return; const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(host.current); return () => observer.disconnect(); }, []);
  const scale = Math.min(1, (width - 20) / 1080, 740 / 1350) * zoom;
  useEffect(() => {
    const node = selected ? stage.current?.findOne(`#${selected}`) : null;
    transformer.current?.nodes(node?.isVisible() ? [node] : []);
  }, [selected, layers]);
  useImperativeHandle(handle, () => ({ renderLayers(candidate) {
      if (!ready || !stage.current) throw new Error('not_ready');
      if (candidate.length !== layers.length || candidate.some(item => !layers.some(original => original.id === item.id && original.kind === item.kind && original.assetId === item.assetId))) throw new Error('repair_assets');
      const copy = stage.current.getLayers()[0].clone() as Konva.Layer;
      try {
        copy.getChildren().filter(child => child.getClassName() === 'Transformer').forEach(child => child.destroy());
        candidate.forEach((item, index) => {
          const group = copy.findOne(`#${item.id}`) as Konva.Group;
          if (item.visible && item.assetId && !group.getChildren().some(child => child.getClassName() === 'Image')) throw new Error('repair_assets');
          group.setAttrs({ x: item.x, y: item.y, width: item.width, height: item.height, clipWidth: item.width, clipHeight: item.height, visible: item.visible, opacity:item.opacity??1, scaleX: 1, scaleY: 1 }); group.zIndex(index);
          group.getChildren().forEach(child => {
            if (child.getClassName() === 'Rect') child.setAttrs({ width: item.width, height: item.height, fill: ['background', 'brand', 'headline', 'cta'].includes(item.kind) ? item.fill : 'rgba(0,0,0,0)' });
            if (child.getClassName() === 'Text') child.setAttrs({ width: item.width, height: item.height, text: item.text, fontFamily: item.fontFamily, fontSize: item.fontSize, fill: item.color });
            if (child.getClassName() === 'Image') {
              const image = (child as Konva.Image).image() as HTMLImageElement;
              const ratio = item.kind === 'background' ? Math.max(item.width / image.width, item.height / image.height) : Math.min(item.width / image.width, item.height / image.height);
              child.setAttrs({ x: (item.width - image.width * ratio) / 2, y: (item.height - image.height * ratio) / 2, width: image.width * ratio, height: image.height * ratio });
            }
          });
        });
        return copy.toDataURL({ x: 0, y: 0, width: 1080, height: 1350, pixelRatio: 1 });
      } finally { copy.destroy(); }
    }, measureText(candidate = layers) {
      const metrics: TextMetrics = {};
      for (const item of candidate.filter(layer => layer.visible && ['headline', 'brand', 'cta'].includes(layer.kind))) {
        const group = stage.current?.findOne(`#${item.id}`) as Konva.Group | undefined;
        const node = group?.getChildren().find(child => child.getClassName() === 'Text') as Konva.Text | undefined;
        if (!node) continue;
        const measured = node.clone({ height: 'auto', width: item.width, text: item.text, fontSize: item.fontSize, fontFamily: item.fontFamily }) as Konva.Text;
        const drawn = measured.textArr.map(line => line.text).join('').replace(/\s/g, '');
        metrics[item.id] = { neededHeight: measured.height(), unrenderable: drawn.length < item.text.replace(/\s/g, '').length };
        measured.destroy();
      }
      return metrics;
    }, exportPng() {
      if (!stage.current || !ready) throw new Error('not_ready');
      const transform = transformer.current; transform?.hide(); const overlays=stage.current.find('.editor-overlay'); overlays.forEach(node=>node.hide());
      try {
        const canvas = stage.current.toCanvas({ pixelRatio: 1 / scale });
        // Canvas dimensions are integers; normalize rounding from responsive scales.
        const output = document.createElement('canvas'); output.width = 1080; output.height = 1350;
        output.getContext('2d')!.drawImage(canvas, 0, 0, 1080, 1350); return output.toDataURL('image/png');
      } finally { transform?.show(); overlays.forEach(node=>node.show()); }
    } }), [ready, scale, layers]);
  return <div ref={host} className="design-canvas-host"><div className="design-canvas-scroll" tabIndex={0} role="group" aria-label={label} onKeyDown={event => {
    if (disabled || !selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const layer = layers.find(item => item.id === selected); if (!layer || layer.kind === 'background') return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    patch(selected, { x: layer.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: layer.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) });
  }}><Stage ref={stage} width={1080 * scale} height={1350 * scale} scaleX={scale} scaleY={scale} onMouseDown={event => { if (event.target === stage.current) select(null); }}>
    <Layer>{layers.map(layer => {
      const asset = assets.find(item => item.id === layer.assetId);
      return <Group key={layer.id} id={layer.id} visible={layer.visible} opacity={layer.opacity??1} x={layer.x} y={layer.y} width={layer.width} height={layer.height} clipWidth={layer.width} clipHeight={layer.height}
        draggable={!disabled && layer.kind !== 'background'} onClick={() => select(layer.id)} onTap={() => select(layer.id)}
        onDragEnd={event => { const safe = clampLayer(layer, { x: event.target.x(), y: event.target.y() }); event.target.position({ x: safe.x, y: safe.y }); patch(layer.id, safe); }}
        onTransformEnd={event => { const node = event.target; const safe = clampLayer(layer, { x: node.x(), y: node.y(), width: layer.width * node.scaleX(), height: layer.height * node.scaleY() }); node.setAttrs({ x: safe.x, y: safe.y, width: safe.width, height: safe.height, scaleX: 1, scaleY: 1 }); patch(layer.id, safe); }}>
        <Rect width={layer.width} height={layer.height} fill={['background', 'cta', 'headline', 'brand'].includes(layer.kind) ? layer.fill : 'rgba(0,0,0,0)'} cornerRadius={layer.kind === 'cta' ? 24 : 0} preventDefault={layer.kind !== 'background'}/>
        {asset ? <Raster blob={asset.blob} id={asset.id} width={layer.width} height={layer.height} cover={layer.kind === 'background'} onReady={onReady}/> : null}
        {['headline', 'brand', 'cta'].includes(layer.kind) && <Text text={layer.text} width={layer.width} height={layer.height} padding={layer.kind === 'cta' ? 15 : 8} fill={layer.color} fontFamily={layer.fontFamily} fontSize={layer.fontSize} lineHeight={1.2} align={layer.kind === 'cta' ? 'center' : resolveLayerDirection(layer) === 'rtl' ? 'right' : 'left'} verticalAlign="middle" wrap="word" direction={resolveLayerDirection(layer)}/>}
      </Group>;
    })}<Transformer ref={transformer} rotateEnabled={false} flipEnabled={false} enabledAnchors={!disabled && selected && layers.find(layer => layer.id === selected)?.kind !== 'background' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []} boundBoxFunc={(old, next) => Math.abs(next.width) < 24 * scale || Math.abs(next.height) < 24 * scale ? old : next}/></Layer>
    <Layer name="editor-overlay">{safeZones(placement).map((zone,index)=><Rect key={index} {...zone} fill="#bb33333b" listening={false}/>)}{findings.flatMap((issue,index)=>issue.layerIds.slice(0,1).map(id=>{const item=layers.find(layer=>layer.id===id);return item && item.visible?<Group key={issue.id} onClick={()=>onIssue?.(issue)} onTap={()=>onIssue?.(issue)}><Rect x={item.x} y={item.y} width={item.width} height={item.height} stroke={issue.severity==="error"?"#c93333":"#c76c12"} dash={[14,8]} strokeWidth={5}/><Circle x={item.x+22} y={item.y+22} radius={22} fill={issue.severity==="error"?"#c93333":"#ac5a11"}/><Text x={item.x} y={item.y} width={44} height={44} align="center" text={String(index+1)} fontSize={30} fill="#fff" padding={6}/></Group>:null;}))}</Layer>
  </Stage></div></div>;
}
