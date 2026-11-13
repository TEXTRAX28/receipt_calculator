import {
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  PDFWorker,
  PasswordException,
  type PDFDocumentLoadingTask,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MAX_IMAGE_BYTES, prepareImage, type ReceiptImage } from "./images";

GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_PAGE_PIXELS = 12_000_000;
const PDF_IMPORT_MS = 60000;

/** One owned worker and one rendered page at a time; no viewer, links or document actions. */
export async function preparePdf(
  file: File,
  options: {
    remaining: number;
    signal: AbortSignal;
    progress: (message: string) => void;
  },
): Promise<ReceiptImage[]> {
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose a PDF smaller than 12 MB.");
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(PDF_IMPORT_MS),
  ]);
  let loading: PDFDocumentLoadingTask | undefined,
    rendering: RenderTask | undefined;
  let worker: PDFWorker | undefined, canvas: HTMLCanvasElement | undefined;
  let workerPort: Worker | undefined,
    streamFailed = false;
  // PDF.js 6.4.299 can resolve a partial operator list before rejecting its stream.
  // Observe its pinned StreamKind.ERROR protocol as well as the public promises.
  // Do not retain the worker's reason, which can contain document content.
  const observeFailure = (event: MessageEvent) => {
    if (
      event.data?.stream === 5 &&
      Number.isInteger(event.data?.streamId) &&
      event.data?.reason
    )
      streamFailed = true;
  };
  const prepared: ReceiptImage[] = [];
  const guard = <T>(promise: Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => reject(new Error("PDF import stopped."));
      signal.addEventListener("abort", abort, { once: true });
      promise
        .then((value) => {
          if (streamFailed)
            reject(new Error("PDF parsing returned incomplete page data."));
          else resolve(value);
        }, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
  };
  const stop = () => {
    rendering?.cancel();
    void loading?.destroy().catch(() => {});
    worker?.destroy();
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    options.progress("Opening PDF on this device…");
    const data = new Uint8Array(await guard(file.arrayBuffer()));
    worker = new PDFWorker();
    await guard(worker.promise);
    if (!(worker.port instanceof Worker))
      throw new Error("The PDF worker could not start.");
    workerPort = worker.port;
    workerPort.addEventListener("message", observeFailure);
    const asset = (directory: string) =>
      new URL(`/pdf-assets/${directory}/`, location.origin).href;
    loading = getDocument({
      data,
      worker,
      verbosity: 0,
      cMapUrl: asset("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: asset("standard_fonts"),
      wasmUrl: asset("wasm"),
      iccUrl: asset("iccs"),
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      enableXfa: false,
      stopAtErrors: true,
      disableFontFace: true,
      useSystemFonts: false,
      maxImageSize: MAX_PAGE_PIXELS,
      canvasMaxAreaInBytes: MAX_PAGE_PIXELS * 4,
    });
    const document = await guard(loading.promise);
    if (document.isPureXfa)
      throw new Error(
        "This PDF form cannot be read safely. Export it as a flat PDF or image.",
      );
    if (document.numPages < 1 || document.numPages > options.remaining)
      throw new Error(
        `This PDF has ${document.numPages} pages; there is room for ${options.remaining}. Import fewer pages or start a new receipt.`,
      );
    let totalPixels = 0;
    for (let number = 1; number <= document.numPages; number++) {
      signal.throwIfAborted();
      options.progress(
        `Preparing PDF page ${number} of ${document.numPages} on this device…`,
      );
      const page = await guard(document.getPage(number));
      const original = page.getViewport({ scale: 1 });
      if (
        ![original.width, original.height].every(Number.isFinite) ||
        original.width < 1 ||
        original.height < 1 ||
        original.width > 20000 ||
        original.height > 20000
      )
        throw new Error(
          "PDF page dimensions are too large or invalid. Export smaller pages first.",
        );
      const scale = Math.min(
        2,
        1400 / original.width,
        12000 / Math.max(original.width, original.height),
        Math.sqrt(MAX_PAGE_PIXELS / (original.width * original.height)),
      );
      const viewport = page.getViewport({ scale });
      canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      totalPixels += canvas.width * canvas.height;
      if (totalPixels > 48_000_000)
        throw new Error(
          "These PDF pages are too large together. Import a smaller document.",
        );
      const operators = await guard(
        page.getOperatorList({ annotationMode: AnnotationMode.ENABLE }),
      );
      if (operators.fnArray.length > 100000)
        throw new Error(
          "This PDF page is too complex. Export a simpler receipt PDF or image.",
        );
      rendering = page.render({
        canvas,
        viewport,
        annotationMode: AnnotationMode.ENABLE,
        background: "white",
      });
      rendering.onContinue = (resume: () => void) => {
        setTimeout(() => {
          if (signal.aborted) rendering?.cancel();
          else resume();
        }, 0);
      };
      await guard(rendering.promise);
      rendering = undefined;
      const blob = await guard(
        new Promise<Blob>((resolve, reject) =>
          canvas!.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("Could not render this PDF page.")),
            "image/jpeg",
            0.96,
          ),
        ),
      );
      canvas.width = canvas.height = 0;
      canvas = undefined;
      const image = await guard(
        prepareImage(
          new File([blob], `PDF page ${number}.jpg`, { type: "image/jpeg" }),
        ).then((value) => {
          if (signal.aborted) {
            URL.revokeObjectURL(value.url);
            signal.throwIfAborted();
          }
          return value;
        }),
      );
      if (signal.aborted) {
        URL.revokeObjectURL(image.url);
        signal.throwIfAborted();
      }
      prepared.push({
        ...image,
        name: `${file.name.slice(0, 140)} · page ${number}`,
        sourceBytes: (number === 1 ? file.size : 0) + image.blob.size,
        document: { page: number },
      });
      page.cleanup();
    }
    return prepared;
  } catch (error) {
    prepared.forEach((image) => URL.revokeObjectURL(image.url));
    if (options.signal.aborted)
      throw new Error(
        "PDF import cancelled. Your earlier images are still available.",
      );
    if (signal.aborted)
      throw new Error(
        "PDF import took longer than one minute. Try a smaller PDF or receipt images.",
      );
    if (error instanceof PasswordException)
      throw new Error(
        "Password-protected PDFs need an unlocked copy. Export an unlocked receipt PDF and try again.",
      );
    if (
      error instanceof Error &&
      /^(This PDF|These PDF|PDF page|The PDF worker)/.test(error.message)
    )
      throw error;
    throw new Error(
      "This PDF could not be read safely. Try an unlocked PDF, receipt images or manual entry.",
    );
  } finally {
    signal.removeEventListener("abort", stop);
    rendering?.cancel();
    workerPort?.removeEventListener("message", observeFailure);
    await loading?.destroy().catch(() => {});
    worker?.destroy();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
