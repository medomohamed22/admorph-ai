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
  { id: 'setting', instruction: 'another real place where this product is naturally used, different from the original, with props that belong there; keep a similar light' },
  { id: 'light', instruction: 'a different time of day, light quality and camera angle in a related setting' },
  { id: 'palette', instruction: 'a different color palette and mood, with a bolder composition' },
] as const;
export type VariantAxis = (typeof VARIANT_AXES)[number]['id'];

/**
 * Where the product lives: the planner first recognizes the product, then sets
 * each idea in a real place where people naturally use, keep or enjoy it, so
 * the scene tells the product's story at a glance. A place the user typed
 * overrides this for all three ideas.
 */
export const NATURAL_PLACE_RULE = 'First recognize the product in the photo: what it is, who uses it, and where and how it is used. Every setting must be a real place where this product is naturally used, kept, gifted or enjoyed, so the scene tells its story at a glance (for example a home fragrance in a living room, a bedroom or a bathroom; sunscreen at a beach or a pool; coffee on a kitchen counter or in a cafe; running shoes on a track or a city street; a skincare cream on a bathroom shelf or a vanity table). Never put the product in a place that has nothing to do with it.';

/** The planner's instructions for the art brief, shared by the wizard and the variants. */
export function artBriefInstruction(avoid: readonly string[], options: { place?: string; looks?: readonly string[] } = {}): string {
  const place = options.place?.trim();
  const lines = [
    'For every concept also write artBrief: setting (one specific real place, never a plain studio backdrop, empty void or seamless paper), two to four props that belong there and suit the product, lighting, camera (angle and lens), composition (where the product sits and which calm, object-free part of the scene holds the headline), a palette of two to four colors echoing the brand colors, typeStyle (how the headline should look, e.g. bold condensed white sans) and avoid (things that would clash).',
    place
      ? `The user chose where the ad takes place: ${JSON.stringify(place)}. Set all three concepts there, and vary the exact spot, props, light and camera angle so they still differ. This choice overrides any other place.`
      : `${NATURAL_PLACE_RULE} The three concepts use three different such places, with clearly different lights and camera angles. If the written brief names a place, use that place for all three concepts instead.`,
    'Set visualDirection to the same scene in one sentence.',
  ];
  if (options.looks?.length) lines.push(`Light and mood for each concept, in order (adapt them to the place): ${options.looks.map((look, index) => `(${index + 1}) ${look}`).join(' ')}.`);
  if (avoid.length && !place) lines.push(`Recent ads already used these settings; do not reuse them or anything close: ${avoid.map(item => JSON.stringify(item)).join('; ')}.`);
  return lines.join(' ');
}
