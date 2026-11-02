export interface ImagePoint {
  x: number;
  y: number;
}
export type ImageQuad = [ImagePoint, ImagePoint, ImagePoint, ImagePoint];
/** Corners are clockwise TL/TR/BR/BL in the quarter-turned preview, in percent. */
export interface ReceiptGeometry {
  turns: number;
  corners: ImageQuad;
}

export function rectangleQuad(
  bounds = { left: 0, right: 0, top: 0, bottom: 0 },
): ImageQuad {
  return [
    { x: bounds.left, y: bounds.top },
    { x: 100 - bounds.right, y: bounds.top },
    { x: 100 - bounds.right, y: 100 - bounds.bottom },
    { x: bounds.left, y: 100 - bounds.bottom },
  ];
}

export function rotateGeometry(geometry: ReceiptGeometry): ReceiptGeometry {
  const points = geometry.corners.map((p) => ({ x: 100 - p.y, y: p.x }));
  return {
    turns: (geometry.turns + 1) % 4,
    corners: [points[3], points[0], points[1], points[2]],
  };
}

export function validateGeometry(geometry: ReceiptGeometry) {
  if (
    !Number.isInteger(geometry.turns) ||
    geometry.turns < 0 ||
    geometry.turns > 3 ||
    !Array.isArray(geometry.corners) ||
    geometry.corners.length !== 4 ||
    geometry.corners.some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 100 ||
        p.y < 0 ||
        p.y > 100,
    )
  )
    throw new Error("Keep all four corners inside the photo.");
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = geometry.corners[i],
      b = geometry.corners[(i + 1) % 4],
      c = geometry.corners[(i + 2) % 4];
    if (
      (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.1 ||
      Math.hypot(a.x - b.x, a.y - b.y) < 1
    )
      throw new Error(
        "Keep the corners in order around the receipt, without crossing its edges.",
      );
    area += a.x * b.y - a.y * b.x;
  }
  if (area / 2 < 100)
    throw new Error("Choose a larger receipt area, or take a closer photo.");
}

export function sourceQuad(geometry: ReceiptGeometry): ImageQuad {
  validateGeometry(geometry);
  return geometry.corners.map((point) => {
    let { x, y } = point;
    for (let turn = 0; turn < geometry.turns; turn++) [x, y] = [y, 100 - x];
    return { x: x / 100, y: y / 100 };
  }) as ImageQuad;
}

/** Unit-square -> source projective transform. No inferred text or pixel synthesis. */
export function projectiveMapping([p0, p1, p2, p3]: ImageQuad) {
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0,
    h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-12) {
    const divisor = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(divisor) < 1e-12)
      throw new Error("This frame cannot be straightened reliably.");
    g = (dx3 * dy2 - dx2 * dy3) / divisor;
    h = (dx1 * dy3 - dx3 * dy1) / divisor;
  }
  const depths = [1, 1 + g, 1 + h, 1 + g + h];
  if (Math.min(...depths) < Math.max(...depths) * 0.02)
    throw new Error("The photo is too steeply angled. Take a flatter photo.");
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
  ];
}

export function mappedPoint(
  matrix: number[],
  u: number,
  v: number,
): ImagePoint {
  const z = matrix[6] * u + matrix[7] * v + 1;
  return {
    x: (matrix[0] * u + matrix[1] * v + matrix[2]) / z,
    y: (matrix[3] * u + matrix[4] * v + matrix[5]) / z,
  };
}

export function rectifiedSize(width: number, height: number, quad: ImageQuad) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 8 ||
    height < 8 ||
    width > 20000 ||
    height > 20000 ||
    width * height > 25_000_000
  )
    throw new Error("The source image exceeds the correction budget.");
  const distance = (a: ImagePoint, b: ImagePoint) =>
    Math.hypot((a.x - b.x) * (width - 1), (a.y - b.y) * (height - 1)) + 1;
  const w = Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2]));
  const h = Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]));
  const scale = Math.min(
    1,
    20000 / Math.max(w, h),
    Math.sqrt(25_000_000 / (w * h)),
  );
  if (Math.min(w * scale, h * scale) < 8)
    throw new Error("Choose a larger receipt area.");
  return { width: Math.floor(w * scale), height: Math.floor(h * scale) };
}

export interface GeometryPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
/** Exact inverse homography with bilinear interpolation; output is bounded to one reading panel. */
export function warpPixels(
  source: GeometryPixels,
  matrix: number[],
  width: number,
  height: number,
  window = { left: 0, top: 0, right: 1, bottom: 1 },
): GeometryPixels {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4000 ||
    height > 4000 ||
    width * height > 4_000_000 ||
    !Number.isSafeInteger(source.width) ||
    !Number.isSafeInteger(source.height) ||
    source.width < 1 ||
    source.height < 1 ||
    source.width > 20000 ||
    source.height > 20000 ||
    source.width * source.height > 25_000_000 ||
    source.data.length !== source.width * source.height * 4 ||
    matrix.length !== 8 ||
    matrix.some((n) => !Number.isFinite(n)) ||
    Object.values(window).some((n) => !Number.isFinite(n) || n < 0 || n > 1) ||
    window.left >= window.right ||
    window.top >= window.bottom
  )
    throw new Error("Invalid bounded correction pixels.");
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v =
      window.top + ((window.bottom - window.top) * y) / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const u =
        window.left +
        ((window.right - window.left) * x) / Math.max(1, width - 1);
      const point = mappedPoint(matrix, u, v);
      if (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < -1e-8 ||
        point.x > 1 + 1e-8 ||
        point.y < -1e-8 ||
        point.y > 1 + 1e-8
      )
        throw new Error("This frame leaves the photo. Adjust its corners.");
      const sx = Math.min(
        source.width - 1,
        Math.max(0, point.x * (source.width - 1)),
      );
      const sy = Math.min(
        source.height - 1,
        Math.max(0, point.y * (source.height - 1)),
      );
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(source.width - 1, x0 + 1),
        y1 = Math.min(source.height - 1, y0 + 1);
      const fx = sx - x0,
        fy = sy - y0,
        target = (y * width + x) * 4;
      const a = (y0 * source.width + x0) * 4,
        b = (y0 * source.width + x1) * 4;
      const c = (y1 * source.width + x0) * 4,
        d = (y1 * source.width + x1) * 4;
      for (let channel = 0; channel < 3; channel++)
        data[target + channel] =
          (source.data[a + channel] * (1 - fx) +
            source.data[b + channel] * fx) *
            (1 - fy) +
          (source.data[c + channel] * (1 - fx) +
            source.data[d + channel] * fx) *
            fy;
      data[target + 3] = 255;
    }
  }
  return { data, width, height };
}
