import { z } from 'zod';

/**
 * The art-direction brief the planner writes for every idea. A free-text
 * "visual direction" kept producing the same beige studio backdrop; naming
 * the setting, props, light, camera and palette separately forces a real
 * place and gives each idea a scene of its own.
 */
export const artBriefSchema = z.object({
  setting: z.string().trim().min(1).max(300),
  props: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
  lighting: z.string().trim().min(1).max(200),
  camera: z.string().trim().min(1).max(200),
  composition: z.string().trim().min(1).max(300),
  palette: z.array(z.string().trim().min(1).max(60)).min(1).max(6),
  typeStyle: z.string().trim().max(200),
  avoid: z.array(z.string().trim().min(1).max(120)).max(6),
}).strict();
export type ArtBrief = z.infer<typeof artBriefSchema>;

/**
 * The brief as one scene paragraph: what the user reads and edits, and what
 * the painter receives. The schema limits are generous so a wordy model
 * answer still parses; this is where it is clamped to the 1000-character scene.
 */
export function artBriefToScene(brief: ArtBrief): string {
  brief = { ...brief, props: brief.props.slice(0, 4), palette: brief.palette.slice(0, 4), avoid: brief.avoid.slice(0, 4) };
  const parts = [
    `${brief.setting}, with ${brief.props.join(', ')}`,
    `Light: ${brief.lighting}`,
    `Camera: ${brief.camera}`,
    `Composition: ${brief.composition}`,
    `Palette: ${brief.palette.join(', ')}`,
  ];
  if (brief.typeStyle.trim()) parts.push(`Headline style: ${brief.typeStyle}`);
  if (brief.avoid.length) parts.push(`Avoid: ${brief.avoid.join(', ')}`);
  return parts.join('. ').slice(0, 1000);
}

/** How many recent settings the planner is told not to repeat. */
export const RECENT_SCENES_LIMIT = 5;
export const avoidScenesSchema = z.array(z.string().trim().min(1).max(160)).max(RECENT_SCENES_LIMIT);

const sceneKey = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();

/** Put the newest setting first, drop a repeat of it, keep the last five. */
export function rememberScene(recent: readonly string[], setting: string): string[] {
  const clean = setting.trim().slice(0, 160);
  if (!clean) return recent.slice(0, RECENT_SCENES_LIMIT);
  const key = sceneKey(clean);
  return [clean, ...recent.filter(item => sceneKey(item) !== key)].slice(0, RECENT_SCENES_LIMIT);
}

/** The setting part of a scene: the brief's own setting, or the scene's first clause. */
export function settingOf(scene: string): string {
  return scene.split(/[.\n]/)[0].split(', with ')[0].trim().slice(0, 160);
}

/**
 * Variants change one axis each, so three variants never come back as the
 * same picture with a new headline. The axis is named on the result card.
 */
export const VARIANT_AXES = [
  { id: 'setting', instruction: 'a completely different real setting and props; keep a similar light' },
  { id: 'light', instruction: 'a different time of day, light quality and camera angle in a related setting' },
  { id: 'palette', instruction: 'a different color palette and mood, with a bolder composition' },
] as const;
export type VariantAxis = (typeof VARIANT_AXES)[number]['id'];

/** The planner's instructions for the art brief, shared by the wizard and the variants. */
export function artBriefInstruction(avoid: readonly string[]): string {
  const lines = [
    'For every concept also write artBrief: setting (one specific real place, never a plain studio backdrop, empty void or seamless paper), two to four props that belong there and suit the product, lighting, camera (angle and lens), composition (where the product sits and which calm, object-free part of the scene holds the headline), a palette of two to four colors echoing the brand colors, typeStyle (how the headline should look, e.g. bold condensed white sans) and avoid (things that would clash).',
    'The three concepts must use three clearly different settings, lights and camera angles.',
    'Set visualDirection to the same scene in one sentence.',
  ];
  if (avoid.length) lines.push(`Recent ads already used these settings; do not reuse them or anything close: ${avoid.map(item => JSON.stringify(item)).join('; ')}.`);
  return lines.join(' ');
}
