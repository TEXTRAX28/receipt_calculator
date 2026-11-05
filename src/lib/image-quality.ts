/** Advisory capture checks, never proof that receipt text or amounts are legible. */
export type CaptureFlag = "low-resolution" | "dark" | "low-detail" | "blur";
export interface PixelPatch {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export interface CaptureQuality {
  flags: CaptureFlag[];
  meanLuminance: number;
  luminanceDeviation: number;
  blurScore: number | null;
  detailPatches: number;
  sampledPixels: number;
}

export function measurePatch({ data, width, height }: PixelPatch) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 3 ||
    height < 3 ||
    width > 512 ||
    height > 512 ||
    data.length !== width * height * 4
  )
    throw new Error("Invalid bounded capture sample.");
  const gray = new Float32Array(width * height);
  let sum = 0,
    squares = 0;
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    const value =
      0.2126 * data[offset] +
      0.7152 * data[offset + 1] +
      0.0722 * data[offset + 2];
    gray[i] = value;
    sum += value;
    squares += value * value;
  }
  // Suppress one-pixel quantization noise before comparing second and first
  // derivatives. Preserve the original luminance/contrast statistics above.
  const horizontal = new Float32Array(gray.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      horizontal[i] =
        (gray[y * width + Math.max(0, x - 1)] +
          2 * gray[i] +
          gray[y * width + Math.min(width - 1, x + 1)]) /
        4;
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      gray[i] =
        (horizontal[Math.max(0, y - 1) * width + x] +
          2 * horizontal[i] +
          horizontal[Math.min(height - 1, y + 1) * width + x]) /
        4;
    }
  let gradient = 0,
    laplacian = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const dx = (gray[i + 1] - gray[i - 1]) / 2;
      const dy = (gray[i + width] - gray[i - width]) / 2;
      const edge =
        gray[i - 1] +
        gray[i + 1] +
        gray[i - width] +
        gray[i + width] -
        4 * gray[i];
      gradient += dx * dx + dy * dy;
      laplacian += edge * edge;
    }
  }
  const count = (width - 2) * (height - 2);
  const mean = sum / gray.length;
  return {
    mean,
    deviation: Math.sqrt(Math.max(0, squares / gray.length - mean * mean)),
    gradient: gradient / count,
    blurScore: gradient > 0 ? laplacian / gradient : null,
  };
}

export function captureQuality(
  width: number,
  height: number,
  overview: PixelPatch,
  patches: PixelPatch[],
): CaptureQuality {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 20000 ||
    height > 20000 ||
    width * height > 25_000_000 ||
    patches.length !== 3
  )
    throw new Error("Invalid capture dimensions or sample count.");
  const overall = measurePatch(overview);
  const details = patches
    .map(measurePatch)
    .filter(
      (patch) =>
        patch.gradient > 0.5 &&
        patch.deviation >= 7 &&
        patch.blurScore !== null,
    );
  const blurred = details.filter((patch) => patch.blurScore! < 0.3);
  const flags: CaptureFlag[] = [];
  if (Math.min(width, height) < 400) flags.push("low-resolution");
  if (overall.mean < 75) flags.push("dark");
  if (overall.deviation < 10) flags.push("low-detail");
  // Two separate native-resolution regions must agree; blank regions abstain.
  if (blurred.length >= 2) flags.push("blur");
  return {
    flags,
    meanLuminance: overall.mean,
    luminanceDeviation: overall.deviation,
    blurScore: details.length
      ? details.reduce((sum, patch) => sum + patch.blurScore!, 0) /
        details.length
      : null,
    detailPatches: details.length,
    sampledPixels:
      overview.width * overview.height +
      patches.reduce((sum, patch) => sum + patch.width * patch.height, 0),
  };
}

/** Sample original pixels before resizing, grayscale or contrast filters. */
export function inspectCapture(
  source: ImageBitmap | HTMLVideoElement,
  x = 0,
  y = 0,
  width = "videoWidth" in source ? source.videoWidth : source.width,
  height = "videoHeight" in source ? source.videoHeight : source.height,
): CaptureQuality | undefined {
  if (width < 3 || height < 3) return;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const sample = (
      left: number,
      top: number,
      w: number,
      h: number,
      outWidth: number,
      outHeight: number,
    ): PixelPatch => {
      canvas.width = outWidth;
      canvas.height = outHeight;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, outWidth, outHeight);
      context.drawImage(source, left, top, w, h, 0, 0, outWidth, outHeight);
      return context.getImageData(0, 0, outWidth, outHeight);
    };
    const scale = Math.min(1, 256 / Math.max(width, height));
    const overview = sample(
      x,
      y,
      width,
      height,
      Math.max(3, Math.round(width * scale)),
      Math.max(3, Math.round(height * scale)),
    );
    const w = Math.min(512, width),
      h = Math.max(3, Math.min(384, Math.floor(height / 3)));
    const patches = [0, 0.5, 1].map((position) =>
      sample(
        x + Math.round((width - w) / 2),
        y + Math.round((height - h) * position),
        w,
        h,
        w,
        h,
      ),
    );
    return captureQuality(width, height, overview, patches);
  } catch {
    // A missing canvas pixel API must not prevent the existing reader from working.
    return;
  }
}
