import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, ScanLine } from "lucide-react";
import { cropImage, type CropBounds, type ReceiptImage } from "./lib/images";
import { suggestReceiptEdges } from "./lib/edge-preview";
import ImageGeometry from "./ImageGeometry";
export default function ImageCropper({
  image,
  onApply,
  onCancel,
  title = "Just the receipt, please.",
  description = "Trim away the table, carpet or background. Keep all receipt text inside the green frame. Your original photo stays available for review.",
  applyLabel = "Apply crop",
  allowEdgeSuggestion = true,
}: {
  image: ReceiptImage;
  onApply: (image: ReceiptImage) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
  applyLabel?: string;
  allowEdgeSuggestion?: boolean;
}) {
  const [bounds, setBounds] = useState<CropBounds>(
    image.crop || { left: 0, right: 0, top: 0, bottom: 0 },
  );
  const [busy, setBusy] = useState(false);
  const [geometryOpen, setGeometryOpen] = useState(!!image.geometry);
  const [error, setError] = useState("");
  const [finding, setFinding] = useState(false);
  const [edgeMessage, setEdgeMessage] = useState("");
  const edgeTask = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      edgeTask.current?.abort();
    };
  }, []);
  const opposites = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
  } as const;
  async function findEdges() {
    const task = new AbortController();
    edgeTask.current?.abort();
    edgeTask.current = task;
    setFinding(true);
    setError("");
    setEdgeMessage("Looking for paper edges on this device…");
    try {
      const suggestion = await suggestReceiptEdges(image.blob, task.signal);
      if (!live.current || edgeTask.current !== task) return;
      if (suggestion) {
        setBounds(suggestion.bounds);
        setEdgeMessage(
          "Suggested frame. Check every corner, item and total before applying. You can adjust any edge below.",
        );
      } else
        setEdgeMessage(
          "Couldn’t clearly separate the receipt from the background. Adjust the frame below; keep all receipt text inside.",
        );
    } catch (e) {
      if (live.current && !task.signal.aborted) setError((e as Error).message);
    } finally {
      if (live.current && edgeTask.current === task) {
        edgeTask.current = null;
        setFinding(false);
      }
    }
  }
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
  if (geometryOpen)
    return (
      <ImageGeometry
        image={image}
        bounds={bounds}
        onApply={onApply}
        onCancel={onCancel}
        onBack={() => setGeometryOpen(false)}
      />
    );
  return (
    <div className="cropper">
      <h2>{title}</h2>
      <p>{description}</p>
      {allowEdgeSuggestion && !image.document && (
        <button
          className="button button-outline"
          disabled={busy || finding}
          onClick={() => setGeometryOpen(true)}
        >
          Rotate or straighten
        </button>
      )}
      {allowEdgeSuggestion && !image.document && (
        <div className="crop-edge-tools">
          <button
            className="button button-outline"
            disabled={busy || finding}
            onClick={() => void findEdges()}
          >
            <ScanLine size={17} />{" "}
            {finding ? "Finding edges…" : "Find receipt edges"}
          </button>
          <p role="status" className="crop-edge-status">
            {edgeMessage ||
              "Optional: find the paper edges on this device, then check the frame."}
          </p>
        </div>
      )}
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
              disabled={busy || finding}
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
          onClick={() => {
            edgeTask.current?.abort();
            edgeTask.current = null;
            setFinding(false);
            setEdgeMessage("");
            setError("");
            setBounds({ left: 0, right: 0, top: 0, bottom: 0 });
          }}
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
          disabled={busy || finding}
          onClick={() => void apply()}
        >
          <Check size={17} />
          {busy ? "Cropping…" : applyLabel}
        </button>
      </div>
    </div>
  );
}
