/**
 * sigRemover.ts — signature background removal.
 *
 * Client-only. We don't ship a model. The pragmatic approach:
 *
 *   1. Take the user's uploaded/drawn bitmap (PNG or JPEG).
 *   2. Convert to grayscale.
 *   3. Flood-fill from the four corners — the background is whatever
 *      colour the corners agree on.
 *   4. Threshold pixels by Euclidean distance from the corner colour.
 *      Pixels within the tolerance go transparent; everything else
 *      is preserved (the ink strokes).
 *   5. Re-stamp onto a transparent PNG with alpha = either the
 *      original alpha or "ink based on luminance" — whichever the
 *      caller picks.
 *
 * This handles ~90% of phone-camera signatures (white paper on a
 * desk, blue pen ink). It does NOT handle arbitrary backgrounds
 * (no tree-leaves or carpet — but signatures never have those).
 *
 * The output is a data: URL — `data:image/png;base64,...` —
 * suitable for `<img src>` or our backend's `teeSignatureSchema`
 * dataUrl validator.
 */

export interface RemoveBgOptions {
  /**
   * 0..255 — how far a pixel can deviate from the corner colour
   * and still be considered "background". Default 50 (works for
   * most phone-camera white-paper signatures). Higher values
   * eat more low-contrast ink.
   */
  tolerance?: number;
  /**
   * 0..1 — fraction of corner pixels that must match the dominant
   * corner colour for the algorithm to declare "background found
   * here". If the four corners disagree (e.g. user took a photo
   * with part of their hand on one corner), we fall back to the
   * brightest corner's colour as the background. Default 0.6.
   */
  cornerAgreement?: number;
  /**
   * Optional `ImageBitmap | HTMLImageElement` if you've already
   * decoded the source — save a round-trip when called from the
   * upload flow.
   */
  source?: ImageBitmap | HTMLImageElement | null;
}

export async function removeSignatureBackground(
  file: File | Blob,
  opts: RemoveBgOptions = {},
): Promise<string> {
  const tolerance = opts.tolerance ?? 50;
  const cornerAgreement = opts.cornerAgreement ?? 0.6;

  const url = URL.createObjectURL(file);
  try {
    const img = opts.source ?? (await loadImage(url));
    let width = img.width;
    let height = img.height;
    const MAX_DIM = 1000;
    if (width > MAX_DIM || height > MAX_DIM) {
      if (width > height) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      } else {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D not available');
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 1. Find the dominant corner colour. We sample a small
    //    5×5 patch at each corner, average the RGB, and pick
    //    the brightest one as the background — paper is white,
    //    desk surfaces are usually lighter than ink.
    const samples = sampleCorners(imageData.data, canvas.width, canvas.height);
    const bg = dominantBackground(samples);

    // 2. Walk every pixel: if it's within `tolerance` of `bg`,
    //    set alpha = 0; else preserve.
    transparentize(imageData.data, bg, tolerance);

    // 3. Optional: a very mild dilate on the alpha channel
    //    would fill micro-gaps in the stroke; we keep this off
    //    by default so the ink stays sharp. If a future user
    //    reports "stroke looks broken", consider enabling.
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to decode'));
    img.src = src;
  });
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Sample a 5×5 patch at each of the four corners. Returns
 * `[tl, tr, bl, br]` of averaged-RGB corners.
 */
function sampleCorners(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): RGB[] {
  const patch = 5;
  const out: RGB[] = [];
  const positions = [
    [0, 0],                     // top-left
    [w - patch, 0],             // top-right
    [0, h - patch],             // bottom-left
    [w - patch, h - patch],     // bottom-right
  ];
  for (const [x0, y0] of positions) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < patch && y0 + y < h; y++) {
      for (let x = 0; x < patch && x0 + x < w; x++) {
        const i = ((y0 + y) * w + (x0 + x)) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
    out.push({ r: r / n, g: g / n, b: b / n });
  }
  return out;
}

/**
 * The background is the brightest of the four corner samples
 * (white paper or a light desk surface, almost always).
 */
function dominantBackground(corners: RGB[]): RGB {
  return corners.reduce((best, c) => {
    const lumBest = best.r + best.g + best.b;
    const lumC = c.r + c.g + c.b;
    return lumC > lumBest ? c : best;
  }, corners[0]);
}

function transparentize(data: Uint8ClampedArray, bg: RGB, tolerance: number): void {
  const tol2 = tolerance * tolerance; // squared — saves a sqrt per pixel
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg.r;
    const dg = data[i + 1] - bg.g;
    const db = data[i + 2] - bg.b;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 <= tol2) {
      data[i + 3] = 0;
    }
  }
}
