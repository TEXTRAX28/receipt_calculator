export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_PIXELS = 25_000_000;
export interface ImageHeader {
  type: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}
const u16be = (b: Uint8Array, p: number) => b[p] * 256 + b[p + 1];
const u32be = (b: Uint8Array, p: number) =>
  b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3];
const u32le = (b: Uint8Array, p: number) =>
  b[p] + b[p + 1] * 256 + b[p + 2] * 65536 + b[p + 3] * 16777216;
const ascii = (b: Uint8Array, p: number, length: number) =>
  String.fromCharCode(...b.slice(p, p + length));
export function inspectImage(
  bytes: Uint8Array,
  declaredType: string,
  fileSize = bytes.length,
): ImageHeader {
  if (!fileSize || fileSize > MAX_IMAGE_BYTES)
    throw new Error("Choose an image smaller than 12 MB.");
  if (bytes.length < 24)
    throw new Error("This image is incomplete or malformed.");
  let type: ImageHeader["type"];
  let width = 0,
    height = 0;
  if (
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[0] === 137 &&
    ascii(bytes, 12, 4) === "IHDR" &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  ) {
    type = "image/png";
    width = u32be(bytes, 16);
    height = u32be(bytes, 20);
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    type = "image/jpeg";
    let position = 2;
    while (position + 9 < bytes.length) {
      if (bytes[position] !== 255) break;
      const marker = bytes[position + 1];
      if (marker === 255) {
        position++;
        continue;
      }
      if (marker === 217 || marker === 218) break;
      const length = u16be(bytes, position + 2);
      if (length < 2 || position + length + 2 > bytes.length)
        throw new Error("Malformed JPEG segment.");
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = u16be(bytes, position + 5);
        width = u16be(bytes, position + 7);
        break;
      }
      position += length + 2;
    }
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    type = "image/webp";
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      if (bytes[20] & 2)
        throw new Error(
          "Animated WebP is not supported. Choose a still image.",
        );
      width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536;
      height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536;
    } else if (
      chunk === "VP8 " &&
      bytes.length >= 30 &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    ) {
      width = (bytes[26] + bytes[27] * 256) & 16383;
      height = (bytes[28] + bytes[29] * 256) & 16383;
    } else if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 47) {
      const bits = u32le(bytes, 21);
      width = 1 + (bits & 16383);
      height = 1 + ((bits >>> 14) & 16383);
    }
  } else
    throw new Error(
      "Use a JPEG, PNG or still WebP image. The file signature does not match a supported image.",
    );
  if (declaredType && declaredType !== type)
    throw new Error(
      "The file type and image signature do not match. Re-export it as JPEG or PNG.",
    );
  if (
    !width ||
    !height ||
    width > 20000 ||
    height > 20000 ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      "Image dimensions exceed 20,000 pixels per side or 25 megapixels. Crop or resize the receipt first.",
    );
  return { type, width, height };
}
export interface ReceiptImage {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  ocrBlob?: Blob;
  crop?: CropBounds;
}
export interface CropBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export async function cropImage(
  image: ReceiptImage,
  bounds: CropBounds,
): Promise<ReceiptImage> {
  const entries = Object.values(bounds);
  if (
    entries.some((n) => !Number.isFinite(n) || n < 0 || n > 90) ||
    bounds.left + bounds.right > 95 ||
    bounds.top + bounds.bottom > 95
  )
    throw new Error("Keep a visible receipt area inside the crop frame.");
  const bitmap = await createImageBitmap(image.blob);
  try {
    const x = Math.round((bitmap.width * bounds.left) / 100),
      y = Math.round((bitmap.height * bounds.top) / 100);
    const width = Math.max(
      1,
      Math.round((bitmap.width * (100 - bounds.left - bounds.right)) / 100),
    );
    const height = Math.max(
      1,
      Math.round((bitmap.height * (100 - bounds.top - bounds.bottom)) / 100),
    );
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      2,
      3200 / Math.max(width, height),
      Math.sqrt(4_000_000 / (width * height)),
    );
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.12)";
    context.drawImage(
      bitmap,
      x,
      y,
      width,
      height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const ocrBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not crop this image.")),
        "image/jpeg",
        0.96,
      ),
    );
    return { ...image, ocrBlob, crop: bounds };
  } finally {
    bitmap.close();
  }
}
export async function prepareImage(file: File): Promise<ReceiptImage> {
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose an image smaller than 12 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = inspectImage(bytes, file.type, file.size);
  // Validate dimensions before asking a decoder to allocate pixel memory.
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const decode = createImageBitmap(file).then((bitmap) => {
    if (expired) {
      bitmap.close();
      throw new Error("Image decoding timed out.");
    }
    return bitmap;
  });
  const bitmap = await Promise.race([
    decode,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new Error("Image decoding timed out. Try a smaller JPEG."));
      }, 10000);
    }),
  ]).finally(() => clearTimeout(timer));
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS || !header.width)
      throw new Error("Decoded image is too large.");
    const scale = Math.min(
      1,
      3200 / Math.max(bitmap.width, bitmap.height),
      Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image processing is unavailable. Use manual entry.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not prepare the image.")),
        "image/jpeg",
        0.94,
      ),
    );
    return {
      id: crypto.randomUUID(),
      name: file.name.slice(0, 180),
      url: URL.createObjectURL(blob),
      blob,
    };
  } catch {
    throw new Error(
      "This image could not be decoded safely. Try a different JPEG or enter the receipt manually.",
    );
  } finally {
    bitmap.close();
  }
}
