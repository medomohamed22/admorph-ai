'use client';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer } from 'react-konva';
import type Konva from 'konva';
import { ONESHOT_WIDTH, ONESHOT_HEIGHT, clampOneshotElement, type OneshotCanvasElement } from '@/lib/ai/oneshot';
import { fitContain } from '@/lib/editor/fit';
import { useObjectUrl } from './logo';

const ARABIC = /[\u0600-\u06FF]/;

function Raster({ blob, id, width, height, onReady }: { blob: Blob; id: string; width: number; height: number; onReady: (id: string) => void }) {
  const url = useObjectUrl(blob); const [image, setImage] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!url) return; let alive = true; const next = new window.Image(); next.src = url;
    next.decode().then(() => { if (alive) { setImage(next); onReady(id); } }).catch(() => {});
    return () => { alive = false; };
  }, [url, onReady, id]);
  if (!image) return null;
  const fitted = fitContain({ width, height }, image.width, image.height);
  return <KonvaImage image={image} x={fitted.x} y={fitted.y} width={fitted.width} height={fitted.height} listening={false}/>;
}

export type OneshotCanvasHandle = { exportPng: () => string };

/**
 * The one-shot mockup canvas: the user arranges the cutout product, the
 * logo, and text elements (headline, phone, extra lines, icons) by touch or
 * mouse, then the arrangement is exported as the layout reference the AI
 * paints over. Deliberately separate from the studio editor: this canvas
 * owns no creative state, only positions.
 */
export default function OneshotCanvas({ elements, selected, select, change, handle, onReady, label, disabled }: {
  elements: OneshotCanvasElement[]; selected: string | null; select: (id: string | null) => void;
  change: (id: string, values: Partial<OneshotCanvasElement>) => void; handle: React.RefObject<OneshotCanvasHandle | null>;
  onReady: (id: string) => void; label: string; disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), stage = useRef<Konva.Stage>(null), transformer = useRef<Konva.Transformer>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => { if (!host.current) return; const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(host.current); return () => observer.disconnect(); }, []);
  const scale = Math.min(1, (width - 20) / ONESHOT_WIDTH, 740 / ONESHOT_HEIGHT);
  useEffect(() => {
    const node = selected ? stage.current?.findOne(`#${selected}`) : null;
    transformer.current?.nodes(node?.isVisible() ? [node] : []);
  }, [selected, elements]);
  useImperativeHandle(handle, () => ({ exportPng() {
    if (!stage.current) throw new Error('not_ready');
    const transform = transformer.current; transform?.hide();
    try {
      const canvas = stage.current.toCanvas({ pixelRatio: 1 / scale });
      const output = document.createElement('canvas'); output.width = ONESHOT_WIDTH; output.height = ONESHOT_HEIGHT;
      output.getContext('2d')!.drawImage(canvas, 0, 0, ONESHOT_WIDTH, ONESHOT_HEIGHT); return output.toDataURL('image/png');
    } finally { transform?.show(); }
  } }), [scale]);
  return <div ref={host} className="design-canvas-host" data-testid="oneshot-canvas"><div className="design-canvas-scroll" tabIndex={0} role="group" aria-label={label} onKeyDown={event => {
    if (disabled || !selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const element = elements.find(item => item.id === selected); if (!element) return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    change(selected, clampOneshotElement({ ...element, x: element.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: element.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }));
  }}><Stage ref={stage} width={ONESHOT_WIDTH * scale} height={ONESHOT_HEIGHT * scale} scaleX={scale} scaleY={scale} onMouseDown={event => { if (event.target === stage.current) select(null); }}>
    <Layer>
      {/* Neutral mockup sheet: positions stay legible to the image model. */}
      <Rect x={0} y={0} width={ONESHOT_WIDTH} height={ONESHOT_HEIGHT} fill="#e9e9e9" listening={false}/>
      {elements.map(element => {
        const isText = element.kind === 'text' || element.kind === 'phone';
        const rtl = ARABIC.test(element.text ?? '');
        return <Group key={element.id} id={element.id} x={element.x} y={element.y} width={element.width} height={element.height}
          draggable={!disabled} onClick={() => select(element.id)} onTap={() => select(element.id)}
          onDragEnd={event => { const safe = clampOneshotElement({ ...element, x: event.target.x(), y: event.target.y() }); event.target.position({ x: safe.x, y: safe.y }); change(element.id, safe); }}
          onTransformEnd={event => { const node = event.target; const safe = clampOneshotElement({ ...element, x: node.x(), y: node.y(), width: element.width * node.scaleX(), height: element.height * node.scaleY() }); node.setAttrs({ x: safe.x, y: safe.y, width: safe.width, height: safe.height, scaleX: 1, scaleY: 1 }); change(element.id, safe); }}>
          {/* Invisible hit area: the image child below is non-listening, so
              without this rect the group has nothing to grab — taps and
              drags on product/logo/icon pixels passed through to the stage.
              The rect is transparent, so exports and the model see nothing. */}
          {element.blob && <Rect x={0} y={0} width={element.width} height={element.height} fill="rgba(0,0,0,0)" />}
          {element.blob ? <Raster blob={element.blob} id={element.id} width={element.width} height={element.height} onReady={onReady}/> : null}
          {isText && <Text text={element.text ?? ''} width={element.width} height={element.height} padding={8} fill={element.color ?? '#16100C'} fontFamily={element.fontFamily ? `${element.fontFamily}, ${rtl ? 'Cairo' : 'Inter'}` : rtl ? 'Cairo' : 'Inter'} fontSize={element.fontSize ?? 64} lineHeight={1.2} align="center" verticalAlign="middle" wrap="word" direction={rtl ? 'rtl' : 'ltr'}/>}
        </Group>;
      })}
      <Transformer ref={transformer} rotateEnabled={false} flipEnabled={false} enabledAnchors={!disabled && selected ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []} boundBoxFunc={(old, next) => Math.abs(next.width) < 24 * scale || Math.abs(next.height) < 24 * scale ? old : next}/>
    </Layer>
  </Stage></div></div>;
}
