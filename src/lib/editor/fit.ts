// Contain-fit: scale an image into a box without distortion or cropping,
// centered. This is the same math the canvas rasterizer uses; extracting it
// makes the placement testable and reusable by the auto-ads compositor.

export interface Box {
  width: number;
  height: number;
}

export interface FittedBox extends Box {
  x: number;
  y: number;
}

export function fitContain(box: Box, imageWidth: number, imageHeight: number): FittedBox {
  if (
    box.width <= 0 ||
    box.height <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight)
  ) {
    throw new Error('invalid_dimensions');
  }
  const ratio = Math.min(box.width / imageWidth, box.height / imageHeight);
  const width = imageWidth * ratio;
  const height = imageHeight * ratio;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}
