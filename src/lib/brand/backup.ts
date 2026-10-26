import { z } from 'zod';
import { brandInputSchema, type BrandInput } from '../db/schema';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 3 * 1024 * 1024;
export type BrandErrorCode = 'invalidBrand' | 'invalidLogo' | 'logoSize' | 'logoDimensions' | 'invalidBackup' | 'backupSize';
export class BrandError extends Error { constructor(public code: BrandErrorCode) { super(code); } }
const logoSchema = z.string().max(Math.ceil(MAX_LOGO_BYTES * 4 / 3) + 100).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
export const backupSchema = z.object({
  format: z.literal('admorph-brand-kit'), version: z.literal(1), exportedAt: z.string().datetime(),
  brand: brandInputSchema.extend({ logo: logoSchema.nullable() }).strict(),
}).strict();

export async function validateLogo(blob: Blob): Promise<void> {
  if (blob.size > MAX_LOGO_BYTES) throw new BrandError('logoSize');
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!((png && blob.type === 'image/png') || (jpeg && blob.type === 'image/jpeg') || (webp && blob.type === 'image/webp'))) throw new BrandError('invalidLogo');
}
export async function validateLogoDimensions(blob: Blob) {
  await validateLogo(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new BrandError('logoDimensions');
  } catch (error) { if (error instanceof BrandError) throw error; throw new BrandError('invalidLogo'); }
  finally { URL.revokeObjectURL(url); }
}
export async function makeBrandBackup(brand: BrandInput, logo: Blob | null): Promise<string> {
  const data = brandInputSchema.safeParse(brand);
  if (!data.success) throw new BrandError('invalidBrand');
  let encoded: string | null = null;
  if (logo) {
    await validateLogo(logo);
    const bytes = new Uint8Array(await logo.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    encoded = `data:${logo.type};base64,${btoa(binary)}`;
  }
  return JSON.stringify(backupSchema.parse({ format: 'admorph-brand-kit', version: 1, exportedAt: new Date().toISOString(), brand: { ...data.data, logo: encoded } }), null, 2);
}
export async function parseBrandBackup(text: string): Promise<{ brand: BrandInput; logo: Blob | null }> {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new BrandError('backupSize');
  try {
    const parsed = backupSchema.parse(JSON.parse(text));
    const { logo: encoded, ...brand } = parsed.brand;
    let logo: Blob | null = null;
    if (encoded) {
      const [prefix, data] = encoded.split(',');
      const binary = atob(data);
      logo = new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: prefix.slice(5, -7) });
      await validateLogo(logo);
    }
    return { brand, logo };
  } catch (error) { if (error instanceof BrandError) throw error; throw new BrandError('invalidBackup'); }
}
export function downloadBrand(json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'brand-kit.json';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
