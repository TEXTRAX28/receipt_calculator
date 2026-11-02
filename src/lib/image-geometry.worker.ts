import {
  sourceQuad,
  projectiveMapping,
  rectifiedSize,
  warpPixels,
  type ReceiptGeometry,
} from "./image-geometry";
import {
  previewDimensions,
  planReadingPanels,
  inspectImage,
  paddedCorrectionFrame,
} from "./images";
import { captureQuality } from "./image-quality";

self.onmessage = async (
  event: MessageEvent<{ blob: Blob; geometry: ReceiptGeometry }>,
) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const quad = sourceQuad(event.data.geometry);
    const input = event.data.blob;
    inspectImage(
      new Uint8Array(await input.arrayBuffer()),
      input.type,
      input.size,
    );
    bitmap = await createImageBitmap(event.data.blob);
    const size = rectifiedSize(bitmap.width, bitmap.height, quad);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error(
        "Photo correction is unavailable in this browser. Use trimming or take a flatter photo.",
      );
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    bitmap = undefined;
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.height = 1;
    const matrix = projectiveMapping(quad);
    async function encode(width: number, height: number, top = 0, bottom = 1) {
      const output = paddedCorrectionFrame(width, height);
      const pixels = warpPixels(
        source,
        matrix,
        output.contentWidth,
        output.contentHeight,
        {
          left: 0,
          right: 1,
          top,
          bottom,
        },
      );
      canvas.width = output.width;
      canvas.height = output.height;
      context!.fillStyle = "#fff";
      context!.fillRect(0, 0, canvas.width, canvas.height);
      context!.putImageData(
        new ImageData(
          pixels.data as Uint8ClampedArray<ArrayBuffer>,
          output.contentWidth,
          output.contentHeight,
        ),
        output.left,
        output.top,
      );
      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: 0.94,
      });
      canvas.width = canvas.height = 1;
      if (blob.size > 5 * 1024 * 1024)
        throw new Error(
          "The corrected photo is too large. Trim it or use separate photos.",
        );
      return blob;
    }
    const previewSize = previewDimensions(size.width, size.height);
    const preview = await encode(previewSize.width, previewSize.height);
    const plan = planReadingPanels(size.width, size.height);
    if (plan.length > 24)
      throw new Error("Use separate receipt photos for this correction.");
    const panels: Blob[] = [];
    for (const section of plan)
      panels.push(
        await encode(
          section.outputWidth,
          section.outputHeight,
          section.top / (size.height - 1),
          Math.min(1, (section.top + section.height - 1) / (size.height - 1)),
        ),
      );
    const overviewScale = Math.min(1, 256 / Math.max(size.width, size.height));
    const overview = warpPixels(
      source,
      matrix,
      Math.max(3, Math.floor(size.width * overviewScale)),
      Math.max(3, Math.floor(size.height * overviewScale)),
    );
    const patchWidth = Math.min(512, size.width),
      patchHeight = Math.max(3, Math.min(384, Math.floor(size.height / 3)));
    const patches = [0, 0.5, 1].map((position) => {
      const left = (size.width - patchWidth) / 2 / size.width,
        top = ((size.height - patchHeight) * position) / size.height;
      return warpPixels(source, matrix, patchWidth, patchHeight, {
        left,
        right: left + patchWidth / size.width,
        top,
        bottom: top + patchHeight / size.height,
      });
    });
    const quality = captureQuality(size.width, size.height, overview, patches);
    self.postMessage({
      preview,
      panels: panels.length ? panels : undefined,
      width: size.width,
      height: size.height,
      quality,
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Could not straighten this photo.",
    });
  } finally {
    bitmap?.close();
  }
};
