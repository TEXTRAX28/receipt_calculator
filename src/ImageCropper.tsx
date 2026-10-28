import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { cropImage, type CropBounds, type ReceiptImage } from "./lib/images";
export default function ImageCropper({
  image,
  onApply,
  onCancel,
}: {
  image: ReceiptImage;
  onApply: (image: ReceiptImage) => void;
  onCancel: () => void;
}) {
  const [bounds, setBounds] = useState<CropBounds>(
    image.crop || { left: 0, right: 0, top: 0, bottom: 0 },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const opposites = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
  } as const;
  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await cropImage(image, bounds);
      if (live.current) onApply(result);
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <div className="cropper">
      <h2>Just the receipt, please.</h2>
      <p>
        Trim away the table, carpet or background. Keep all receipt text inside
        the green frame. Your original photo stays available for review.
      </p>
      <div className="crop-preview">
        <img src={image.url} alt="Receipt with adjustable crop frame" />
        <div
          className="crop-frame"
          style={{
            left: `${bounds.left}%`,
            right: `${bounds.right}%`,
            top: `${bounds.top}%`,
            bottom: `${bounds.bottom}%`,
          }}
        />
      </div>
      <div className="crop-sliders">
        {(["left", "right", "top", "bottom"] as const).map((edge) => (
          <label key={edge}>
            <span>
              Trim {edge}
              <strong>{bounds[edge]}%</strong>
            </span>
            <input
              type="range"
              aria-label={`Trim ${edge} percent`}
              min="0"
              max="90"
              step="1"
              disabled={busy}
              value={bounds[edge]}
              onChange={(e) =>
                setBounds((b) => ({
                  ...b,
                  [edge]: Math.min(
                    Number(e.target.value),
                    95 - b[opposites[edge]],
                  ),
                }))
              }
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="crop-actions">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setBounds({ left: 0, right: 0, top: 0, bottom: 0 })}
        >
          <RotateCcw size={16} />
          Reset crop
        </button>
        <button
          className="button button-outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="button button-primary"
          disabled={busy}
          onClick={() => void apply()}
        >
          <Check size={17} />
          {busy ? "Cropping…" : "Apply crop"}
        </button>
      </div>
    </div>
  );
}
