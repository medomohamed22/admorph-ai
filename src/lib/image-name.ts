/** A download name whose extension matches the image type (painted ads can come back as PNG or JPEG). */
export function imageFileName(base: string, blob: Blob | null | undefined): string {
  const extension = blob?.type === 'image/jpeg' ? 'jpg' : blob?.type === 'image/webp' ? 'webp' : 'png';
  return `${base}.${extension}`;
}
