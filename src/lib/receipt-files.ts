import { MAX_IMAGE_BYTES, prepareImage } from "./images";

/** Signature checks precede the optional PDF parser or image decoder. */
export async function prepareReceiptFile(
  file: File,
  options: {
    remaining: number;
    signal: AbortSignal;
    progress: (message: string) => void;
  },
) {
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose a receipt file smaller than 12 MB.");
  options.signal.throwIfAborted();
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const pdf = /^%PDF-[12]\.\d/.test(String.fromCharCode(...header));
  if (file.type === "application/pdf" && !pdf)
    throw new Error(
      "The file signature does not match a PDF. Choose a valid receipt PDF or image.",
    );
  if (pdf) {
    if (file.type && file.type !== "application/pdf")
      throw new Error(
        "The file type and PDF signature do not match. Export a PDF and try again.",
      );
    return (await import("./pdf")).preparePdf(file, options);
  }
  return [await prepareImage(file)];
}
