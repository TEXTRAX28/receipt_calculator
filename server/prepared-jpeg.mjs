/** Prepared JPEG envelope/dimension guard, not a substitute for a full decoder.
 * UI inputs have already been decoded/re-encoded by the bounded browser path.
 */
export function validatePreparedJpeg(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 250 ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new Error("Invalid prepared receipt JPEG");
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255)
      throw new Error("Invalid prepared receipt JPEG");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length)
      throw new Error("Invalid prepared receipt JPEG");
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (size < 8) throw new Error("Invalid prepared receipt JPEG");
      const height = bytes.readUInt16BE(offset + 3),
        width = bytes.readUInt16BE(offset + 5);
      if (
        width < 8 ||
        height < 8 ||
        width > 4000 ||
        height > 4000 ||
        width * height > 4_000_000
      )
        throw new Error(
          "Receipt JPEG dimensions exceed the prepared-section limit",
        );
      return { width, height };
    }
    offset += size;
  }
  throw new Error("Prepared receipt JPEG has no supported dimensions");
}
