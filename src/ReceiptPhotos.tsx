import { useEffect, useState } from "react";
import type { ReceiptImage } from "./lib/images";

/** The copy URL belongs to this view; the original URL belongs to capture. */
export default function ReceiptPhotos({ image }: { image: ReceiptImage }) {
  const corrected = !!image.geometry && !!image.ocrBlob;
  const [showCopy, setShowCopy] = useState(corrected);
  const [copyUrl, setCopyUrl] = useState("");
  useEffect(() => {
    if (!corrected) return;
    const url = URL.createObjectURL(image.ocrBlob!);
    setCopyUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [corrected, image.ocrBlob]);
  return (
    <div className="image-dialog">
      <h2>{showCopy ? "Corrected receipt" : "Original receipt"}</h2>
      <p>
        Zoom with your browser or device gestures. Compare it with the editable
        details.
      </p>
      {corrected && (
        <div
          className="geometry-toolbar"
          role="group"
          aria-label="Receipt photo versions"
        >
          <button
            className="button button-outline"
            aria-pressed={!showCopy}
            onClick={() => setShowCopy(false)}
          >
            Original photo
          </button>
          <button
            className="button button-outline"
            aria-pressed={showCopy}
            onClick={() => setShowCopy(true)}
          >
            Corrected copy
          </button>
        </div>
      )}
      {(!showCopy || copyUrl) && (
        <img
          src={showCopy ? copyUrl : image.url}
          alt={
            showCopy
              ? "Corrected receipt, enlarged for review"
              : "Original receipt, enlarged for review"
          }
        />
      )}
    </div>
  );
}
