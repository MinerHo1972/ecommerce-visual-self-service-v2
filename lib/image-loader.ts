/**
 * Get image data URL from RenderInputs by a generic layer key pattern.
 * Checks inputs["imageData_<layerId>"] first, then falls back to inputs[key].
 */
export function getImageDataUrl(inputs: Record<string, unknown>, layerKey: string): string | undefined {
  const val = inputs[`imageData_${layerKey}`] ?? inputs[layerKey];
  return typeof val === "string" ? val : undefined;
}

/**
 * Browser-side async image loader for Canvas rendering.
 * Resolves to HTMLImageElement on success, null on failure.
 * Sets crossOrigin to avoid canvas taint on export.
 */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export type FitMode = "contain" | "cover";

export interface DrawImageRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Calculate source/dest rects for contain or cover fit mode.
 * Returns the 9-arg drawImage parameters.
 * When fitMode is "cover" and focusArea is provided, the crop window
 * centers on the subject region instead of always centering on the image.
 */
export function getObjectFitRect(
  sourceWidth: number,
  sourceHeight: number,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
  fitMode: FitMode,
  focusArea?: { x: number; y: number; width: number; height: number }
): DrawImageRect {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  let dx = targetX;
  let dy = targetY;
  let dw = targetWidth;
  let dh = targetHeight;

  if (fitMode === "contain") {
    // Full image visible, may leave blank space
    if (sourceAspect > targetAspect) {
      // Image is wider — fit width, center vertically
      const scaledHeight = targetWidth / sourceAspect;
      dy = targetY + (targetHeight - scaledHeight) / 2;
      dh = scaledHeight;
    } else {
      // Image is taller — fit height, center horizontally
      const scaledWidth = targetHeight * sourceAspect;
      dx = targetX + (targetWidth - scaledWidth) / 2;
      dw = scaledWidth;
    }
  } else {
    // cover: fill target, may crop image
    if (sourceAspect > targetAspect) {
      // Image is wider — crop sides, fit height
      const cropWidth = sourceHeight * targetAspect;
      sw = cropWidth;

      if (focusArea) {
        // Center crop window on focus area center
        const cx = (clamp01(focusArea.x) + clamp01(focusArea.width) / 2) * sourceWidth;
        sx = cx - cropWidth / 2;
      } else {
        sx = (sourceWidth - cropWidth) / 2;
      }

      // Clamp to image bounds
      sx = Math.max(0, Math.min(sx, sourceWidth - cropWidth));
    } else {
      // Image is taller — crop top/bottom, fit width
      const cropHeight = sourceWidth / targetAspect;
      sh = cropHeight;

      if (focusArea) {
        const cy = (clamp01(focusArea.y) + clamp01(focusArea.height) / 2) * sourceHeight;
        sy = cy - cropHeight / 2;
      } else {
        sy = (sourceHeight - cropHeight) / 2;
      }

      sy = Math.max(0, Math.min(sy, sourceHeight - cropHeight));
    }
  }

  return { sx, sy, sw, sh, dx, dy, dw, dh };
}

/** Clamp a value to 0-1 range. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
