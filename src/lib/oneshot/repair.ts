import { contrastFromLuminance, luminanceOfHex } from '../critic/pixels';
import { clampOneshotElement, type OneshotCanvasElement } from '../ai/oneshot';
import { inspectOneshotLayout, MOCKUP_SHEET, SAFE_MARGIN, TEXT_CONTRAST_MIN, type InspectFinding } from './rules';

/** One deterministic fix for one finding. The patch is element fields only;
 * the studio formats the human-readable description. A finding with no
 * proposal simply has no automatic fix — the loop never guesses. */
export type RepairProposal = { findingId: string; elementId: string; patch: { x?: number; y?: number; color?: string } };

type Box = { x: number; y: number; width: number; height: number };
function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function isBlankText(el: OneshotCanvasElement): boolean {
  return (el.kind === 'text' || el.kind === 'phone') && !el.text?.trim();
}
function isTextKind(el: OneshotCanvasElement): boolean {
  return el.kind === 'text' || el.kind === 'phone';
}
/** Elements that visibly block a candidate position. Blank texts render
 * nothing, so they never block. */
function blockers(elements: OneshotCanvasElement[], excludeId: string): OneshotCanvasElement[] {
  return elements.filter(el => el.id !== excludeId && !isBlankText(el));
}
function fits(box: Box, others: OneshotCanvasElement[]): boolean {
  return others.every(other => !intersects(box, other));
}
function inSafeZone(box: Box): boolean {
  return box.x >= SAFE_MARGIN && box.y >= SAFE_MARGIN
    && box.x + box.width <= 1080 - SAFE_MARGIN && box.y + box.height <= 1350 - SAFE_MARGIN;
}
const GAP = 16;

/** First position that clears every blocker, preferring spots around the
 * named blocker, then steps down and right from the current position.
 * Texts must also land inside the safe zone, or the fix would trade one
 * finding for another. Returns null when nothing fits. */
function searchMove(subject: OneshotCanvasElement, firstBlocker: OneshotCanvasElement, others: OneshotCanvasElement[]): { x: number; y: number } | null {
  const ordered = [firstBlocker, ...others.filter(el => el.id !== firstBlocker.id)];
  const candidates: { x: number; y: number }[] = [];
  for (const blocker of ordered) {
    candidates.push(
      { x: subject.x, y: blocker.y + blocker.height + GAP },
      { x: subject.x, y: blocker.y - GAP - subject.height },
      { x: blocker.x + blocker.width + GAP, y: subject.y },
      { x: blocker.x - GAP - subject.width, y: subject.y },
    );
  }
  for (let step = 1; step <= 12; step++) {
    candidates.push({ x: subject.x, y: subject.y + 40 * step });
    candidates.push({ x: subject.x + 40 * step, y: subject.y });
  }
  for (const candidate of candidates) {
    const placed = clampOneshotElement({ ...subject, ...candidate });
    const box = { x: placed.x, y: placed.y, width: placed.width, height: placed.height };
    if (!fits(box, others)) continue;
    if (isTextKind(subject) && !inSafeZone(box)) continue;
    return { x: placed.x, y: placed.y };
  }
  return null;
}

/** Brand colors first (identity-preserving), then black/white. Picks the
 * highest-contrast qualifier; black on the light sheet always qualifies,
 * so a contrast fix always exists. */
function searchRecolor(brandColors: string[]): string {
  const sheet = luminanceOfHex(MOCKUP_SHEET);
  const bestOf = (colors: string[]): string | null => {
    let best: string | null = null;
    let bestRatio = TEXT_CONTRAST_MIN;
    for (const color of colors) {
      const ratio = contrastFromLuminance(luminanceOfHex(color), sheet);
      if (ratio >= TEXT_CONTRAST_MIN && ratio > bestRatio) { best = color; bestRatio = ratio; }
    }
    return best;
  };
  return bestOf(brandColors) ?? bestOf(['#000000', '#FFFFFF']) ?? '#000000';
}

function proposeFor(finding: InspectFinding, elements: OneshotCanvasElement[], brandColors: string[]): RepairProposal | null {
  const byId = (id: string) => elements.find(el => el.id === id);
  if (finding.code === 'low_contrast') {
    const subject = byId(finding.elementIds[0]);
    if (!subject) return null;
    return { findingId: finding.id, elementId: subject.id, patch: { color: searchRecolor(brandColors) } };
  }
  if (finding.code === 'outside_safe_zone') {
    const subject = byId(finding.elementIds[0]);
    if (!subject) return null;
    const x = Math.max(SAFE_MARGIN, Math.min(subject.x, 1080 - subject.width - SAFE_MARGIN));
    const y = Math.max(SAFE_MARGIN, Math.min(subject.y, 1350 - subject.height - SAFE_MARGIN));
    if (x === subject.x && y === subject.y) return null;
    return { findingId: finding.id, elementId: subject.id, patch: { x, y } };
  }
  // Movement fixes. The moved element is the one the user can afford to
  // move: the non-product item, the second text, or the text under a logo.
  // The logo itself and the product never move for a finding.
  let subject: OneshotCanvasElement | undefined;
  let firstBlocker: OneshotCanvasElement | undefined;
  if (finding.code === 'overlap_product') { subject = byId(finding.elementIds[0]); firstBlocker = byId(finding.elementIds[1]); }
  if (finding.code === 'overlap_text') { subject = byId(finding.elementIds[1]); firstBlocker = byId(finding.elementIds[0]); }
  if (finding.code === 'overlap_logo') { subject = byId(finding.elementIds[1]); firstBlocker = byId(finding.elementIds[0]); }
  if (!subject || !firstBlocker) return null;
  const others = blockers(elements, subject.id);
  const moved = searchMove(subject, firstBlocker, others);
  if (!moved) return null;
  return { findingId: finding.id, elementId: subject.id, patch: moved };
}

/**
 * The repair half of the closed loop: one deterministic proposal per
 * current finding, computed from the same rule set as the inspect panel.
 * No model is consulted, no coordinates are invented — every proposal is
 * geometry or contrast math over the live arrangement, and applying one
 * re-runs the inspect, so the loop verifies itself.
 */
export function proposeOneshotRepairs(elements: OneshotCanvasElement[], brandColors: string[]): RepairProposal[] {
  const proposals: RepairProposal[] = [];
  for (const finding of inspectOneshotLayout(elements)) {
    const proposal = proposeFor(finding, elements, brandColors);
    if (proposal) proposals.push(proposal);
  }
  return proposals;
}
