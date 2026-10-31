/** What every AI route accepts for an uploaded photo. */
export const UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024;
/** Longest side kept when a photo has to be shrunk: more detail than any model reads. */
export const UPLOAD_MAX_SIDE = 2560;

/** True when a photo already fits the upload rules and can go as it is. */
export function fitsUpload(bytes: number, width: number, height: number): boolean {
  return bytes <= UPLOAD_LIMIT_BYTES && Math.max(width, height) <= 4096;
}
