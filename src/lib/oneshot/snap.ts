import { ONESHOT_WIDTH, ONESHOT_HEIGHT } from '../ai/oneshot';

export type Box = { x: number; y: number; width: number; height: number };
/** A guide line in canvas units: vertical lines carry x, horizontal lines carry y. */
export type Guide = { axis: 'x' | 'y'; at: number };

/** Snap distance in canvas pixels (the 1080-wide frame, not screen pixels). */
export const SNAP_DISTANCE = 10;

function stops(boxes: Box[], axis: 'x' | 'y'): number[] {
  const size = axis === 'x' ? ONESHOT_WIDTH : ONESHOT_HEIGHT;
  const lines = [0, size / 2, size];
  for (const box of boxes) {
    const start = axis === 'x' ? box.x : box.y, length = axis === 'x' ? box.width : box.height;
    lines.push(start, start + length / 2, start + length);
  }
  return lines;
}

function snapAxis(start: number, length: number, lines: number[], threshold: number): { value: number; guide: number | null } {
  let best: { delta: number; guide: number } | null = null;
  for (const edge of [0, length / 2, length]) {
    for (const line of lines) {
      const delta = line - (start + edge);
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, guide: line };
    }
  }
  return best ? { value: start + best.delta, guide: best.guide } : { value: start, guide: null };
}

/**
 * Snap a moving box to the frame's edges and center and to the edges and
 * centers of the other elements, whichever is nearest within the threshold,
 * and report the guide lines to draw. Each axis snaps on its own.
 */
export function snapBox(box: Box, others: Box[], threshold = SNAP_DISTANCE): { x: number; y: number; guides: Guide[] } {
  const x = snapAxis(box.x, box.width, stops(others, 'x'), threshold);
  const y = snapAxis(box.y, box.height, stops(others, 'y'), threshold);
  const guides: Guide[] = [];
  if (x.guide !== null) guides.push({ axis: 'x', at: x.guide });
  if (y.guide !== null) guides.push({ axis: 'y', at: y.guide });
  return { x: x.value, y: y.value, guides };
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Align one box to the frame. */
export function alignToFrame(box: Box, alignment: Alignment): { x: number; y: number } {
  switch (alignment) {
    case 'left': return { x: 0, y: box.y };
    case 'center': return { x: (ONESHOT_WIDTH - box.width) / 2, y: box.y };
    case 'right': return { x: ONESHOT_WIDTH - box.width, y: box.y };
    case 'top': return { x: box.x, y: 0 };
    case 'middle': return { x: box.x, y: (ONESHOT_HEIGHT - box.height) / 2 };
    case 'bottom': return { x: box.x, y: ONESHOT_HEIGHT - box.height };
  }
}

/** Move one item a step up or down the stacking order (later in the list paints on top). */
export function moveLayer<T extends { id: string }>(items: T[], id: string, direction: 'up' | 'down'): T[] {
  const index = items.findIndex(item => item.id === id);
  const target = direction === 'up' ? index + 1 : index - 1;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
