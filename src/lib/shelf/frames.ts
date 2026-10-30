/**
 * Local video scan: pull evenly spaced frames from a short phone video and
 * rank them by sharpness (variance of a Laplacian on a small grey copy).
 * Runs entirely in the browser; no frame is sent anywhere until the user
 * goes on with the sharpest one.
 */
export type ScannedFrame = { time: number; blob: Blob; thumb: string; sharpness: number };

export const MAX_VIDEO_SECONDS = 20;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Variance of the 4-neighbour Laplacian over a grey image. Pure, so it is unit-testable. */
export function laplacianVariance(grey: Float32Array | number[], width: number, height: number): number {
  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - width] - grey[i + width];
      sum += value; sumSq += value * value; count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail); resolve(); };
    const fail = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail); reject(new Error('video_seek')); };
    video.addEventListener('seeked', done); video.addEventListener('error', fail);
    video.currentTime = time;
  });
}

export async function scanVideo(file: Blob, count = 8, onFrame?: (frame: ScannedFrame, index: number) => void): Promise<ScannedFrame[]> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error('video_size');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('video_decode')); });
    const duration = Math.min(video.duration || 0, MAX_VIDEO_SECONDS);
    if (!duration || !video.videoWidth) throw new Error('video_decode');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const probe = document.createElement('canvas'); probe.width = 160; probe.height = Math.max(1, Math.round(160 * canvas.height / canvas.width));
    const probeContext = probe.getContext('2d', { willReadFrequently: true })!;
    const frames: ScannedFrame[] = [];
    for (let index = 0; index < count; index++) {
      const time = Math.min(duration - 0.05, (duration * (index + 0.5)) / count);
      await seek(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      probeContext.drawImage(canvas, 0, 0, probe.width, probe.height);
      const pixels = probeContext.getImageData(0, 0, probe.width, probe.height).data;
      const grey = new Float32Array(probe.width * probe.height);
      for (let i = 0; i < grey.length; i++) grey[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('video_frame')), 'image/jpeg', 0.9));
      const frame: ScannedFrame = { time, blob, thumb: probe.toDataURL('image/jpeg', 0.7), sharpness: laplacianVariance(grey, probe.width, probe.height) };
      frames.push(frame); onFrame?.(frame, index);
    }
    return frames;
  } finally { URL.revokeObjectURL(url); video.removeAttribute('src'); }
}

export function sharpestFrame(frames: ScannedFrame[]): ScannedFrame | null {
  return frames.reduce<ScannedFrame | null>((best, frame) => !best || frame.sharpness > best.sharpness ? frame : best, null);
}
