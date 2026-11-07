import { localOcrProvider, type ExtractionProvider } from "./ocr";
import {
  enhancedOcrProvider,
  EnhancedReaderUnavailableError,
} from "./paddle-browser";

/** A single private flow. Only an unavailable reader may fall back, before recognition. */
export const deviceOcrProvider: ExtractionProvider = {
  name: "On-device receipt scan",
  async extract(images, signal, progress) {
    try {
      return await enhancedOcrProvider.extract(images, signal, progress);
    } catch (error) {
      if (signal.aborted || !(error instanceof EnhancedReaderUnavailableError))
        throw error;
      progress("Using the compatibility reader on your device…");
      const result = await localOcrProvider.extract(images, signal, progress);
      return {
        ...result,
        warnings: [
          ...(result.warnings || []),
          "The receipt reader was unavailable in this browser. The compatibility reader prepared this draft on your device; check the full purchase list and every quantity against the photos.",
        ],
      };
    }
  },
};
