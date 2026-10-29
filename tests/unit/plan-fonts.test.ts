import { describe, expect, it } from 'vitest';
import { planSchema } from '../../src/lib/campaign/schema';

const concept = (angle: 'offer' | 'benefit' | 'lifestyle', title: string) => ({
  angle, title, audienceAngle: 'young buyers', headline: `${title} headline`,
  caption: `${title} caption`, visualDirection: `${title} scene`,
});

describe('planSchema fonts', () => {
  it('parses plans with and without suggested fonts', () => {
    const concepts = [concept('offer', 'A'), concept('benefit', 'B'), concept('lifestyle', 'C')];
    expect(planSchema.parse({ concepts, fonts: ['Montserrat', 'Poppins', 'Oswald'] }).fonts).toEqual(['Montserrat', 'Poppins', 'Oswald']);
    expect(planSchema.parse({ concepts }).fonts).toBeUndefined();
  });
  it('rejects more than three fonts', () => {
    const concepts = [concept('offer', 'A'), concept('benefit', 'B'), concept('lifestyle', 'C')];
    expect(planSchema.safeParse({ concepts, fonts: ['A', 'B', 'C', 'D'] }).success).toBe(false);
  });
});
