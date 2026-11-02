import { useEffect, useRef, useState } from "react";
import { Check, RotateCw, RotateCcw, ScanLine } from "lucide-react";
import type { CropBounds, ReceiptImage } from "./lib/images";
import {
  rectangleQuad,
  rotateGeometry,
  validateGeometry,
  type ReceiptGeometry,
} from "./lib/image-geometry";
import { straightenImage, type GeometryResult } from "./lib/geometry-client";

const labels = ["Top left", "Top right", "Bottom right", "Bottom left"];
export default function ImageGeometry({
  image,
  bounds,
  onApply,
  onCancel,
  onBack,
}: {
  image: ReceiptImage;
  bounds: CropBounds;
  onApply: (image: ReceiptImage) => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const [frame, setFrame] = useState<ReceiptGeometry>(
    () => image.geometry || { turns: 0, corners: rectangleQuad(bounds) },
  );
  const [selected, setSelected] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [result, setResult] = useState<GeometryResult | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const worker = useRef<AbortController | null>(null),
    previewUrl = useRef("");
  const live = useRef(true),
    stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      worker.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);
  function update(next: ReceiptGeometry) {
    worker.current?.abort();
    worker.current = null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setPreview("");
    setResult(null);
    setBusy(false);
    setError("");
    setFrame(next);
  }
  function move(index: number, x: number, y: number) {
    const corners = frame.corners.map((p) => ({
      ...p,
    })) as ReceiptGeometry["corners"];
    corners[index] = {
      x: Math.round(Math.max(0, Math.min(100, x)) * 10) / 10,
      y: Math.round(Math.max(0, Math.min(100, y)) * 10) / 10,
    };
    update({ ...frame, corners });
  }
  async function makePreview() {
    const task = new AbortController();
    worker.current?.abort();
    worker.current = task;
    setBusy(true);
    setError("");
    try {
      const corrected = await straightenImage(image, frame, task.signal);
      if (!live.current || worker.current !== task || task.signal.aborted)
        return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(corrected.preview);
      setPreview(previewUrl.current);
      setResult(corrected);
    } catch (e) {
      if (live.current && !task.signal.aborted) setError((e as Error).message);
    } finally {
      if (live.current && worker.current === task) {
        worker.current = null;
        setBusy(false);
      }
    }
  }
  let invalid = "";
  try {
    validateGeometry(frame);
  } catch (e) {
    invalid = (e as Error).message;
  }
  const aspect = dimensions.width
    ? frame.turns % 2
      ? dimensions.height / dimensions.width
      : dimensions.width / dimensions.height
    : 1;
  const points = frame.corners.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <div className="cropper geometry-editor">
      <h2>Turn it. Straighten it.</h2>
      <p>
        Rotate the text upright, then place each corner around the receipt. Keep
        every item and the total inside. Your original photo stays available.
      </p>
      <img
        hidden
        src={image.url}
        alt=""
        onLoad={(event) =>
          setDimensions({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
      />
      <div className="geometry-toolbar">
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => update(rotateGeometry(frame))}
        >
          <RotateCw size={18} />
          Rotate right 90°
        </button>
        <button
          className="text-button"
          onClick={() => update({ turns: 0, corners: rectangleQuad() })}
        >
          <RotateCcw size={16} />
          Reset corrections
        </button>
      </div>
      <div
        ref={stage}
        className="geometry-stage"
        style={{
          width: `${Math.min(400, 460 * aspect)}px`,
          aspectRatio: String(aspect),
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label="Original photo with four receipt corners"
        >
          <image
            href={image.url}
            width="100"
            height="100"
            preserveAspectRatio="none"
            transform={`rotate(${frame.turns * 90} 50 50)`}
          />
          <path
            d={`M0 0H100V100H0Z M${frame.corners.map((p) => `${p.x} ${p.y}`).join("L")}Z`}
            fill="#18221988"
            fillRule="evenodd"
          />
          <polygon
            points={points}
            fill="none"
            stroke="#c6e4a5"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {frame.corners.map((point, i) => (
          <button
            key={i}
            className="geometry-corner"
            aria-label={`${labels[i]} corner`}
            aria-pressed={selected === i}
            title={`${labels[i]}: drag or use arrow keys`}
            disabled={busy}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            onFocus={() => setSelected(i)}
            onPointerDown={(event) => {
              setSelected(i);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (
                !event.currentTarget.hasPointerCapture(event.pointerId) ||
                !stage.current
              )
                return;
              const rect = stage.current.getBoundingClientRect();
              move(
                i,
                ((event.clientX - rect.left) * 100) / rect.width,
                ((event.clientY - rect.top) * 100) / rect.height,
              );
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              const delta: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              const shift = delta[event.key];
              if (!shift) return;
              event.preventDefault();
              const step = event.shiftKey ? 0.1 : 1;
              move(i, point.x + shift[0] * step, point.y + shift[1] * step);
            }}
          >
            <span aria-hidden="true">{i + 1}</span>
          </button>
        ))}
      </div>
      <p className="geometry-hint">
        Drag a corner, or select one below. Arrow keys move it; hold Shift for
        smaller adjustments.
      </p>
      <label className="geometry-select">
        Receipt corner
        <select
          aria-label="Receipt corner"
          value={selected}
          disabled={busy}
          onChange={(event) => setSelected(Number(event.target.value))}
        >
          {labels.map((label, i) => (
            <option value={i} key={label}>
              {i + 1}. {label}
            </option>
          ))}
        </select>
      </label>
      <div className="crop-sliders">
        {(["x", "y"] as const).map((axis) => (
          <label key={axis}>
            <span>
              {axis === "x" ? "Across" : "Down"}
              <strong>{frame.corners[selected][axis]}%</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              disabled={busy}
              aria-label={`${labels[selected]} ${axis === "x" ? "horizontal" : "vertical"} percent`}
              value={frame.corners[selected][axis]}
              onChange={(event) =>
                move(
                  selected,
                  axis === "x"
                    ? Number(event.target.value)
                    : frame.corners[selected].x,
                  axis === "y"
                    ? Number(event.target.value)
                    : frame.corners[selected].y,
                )
              }
            />
          </label>
        ))}
      </div>
      {(invalid || error) && (
        <p className="inline-error" role="alert">
          {invalid || error}
        </p>
      )}
      <p className="geometry-status" role="status">
        {busy
          ? "Straightening this photo on your device…"
          : result
            ? "Preview ready. Check the text, all edges and the total before applying."
            : "Preview the corrected copy before applying it."}
      </p>
      {preview && (
        <figure className="geometry-result">
          <img src={preview} alt="Corrected receipt preview" />
          <figcaption>
            Corrected copy for reading. Missing or blurred text still needs
            another photo.
          </figcaption>
        </figure>
      )}
      <div className="crop-actions">
        <button className="text-button" onClick={onBack}>
          Back to trim
        </button>
        <button className="button button-outline" onClick={onCancel}>
          Cancel
        </button>
        {result ? (
          <button
            className="button button-primary"
            onClick={() =>
              onApply({
                ...image,
                ocrBlob: result.preview,
                panels: result.panels,
                quality: result.quality,
                geometry: structuredClone(frame),
                crop: undefined,
              })
            }
          >
            <Check size={17} />
            Apply correction
          </button>
        ) : (
          <button
            className="button button-primary"
            disabled={busy || !!invalid || !dimensions.width}
            onClick={() => void makePreview()}
          >
            <ScanLine size={17} />
            {busy ? "Preparing preview…" : "Preview correction"}
          </button>
        )}
      </div>
    </div>
  );
}
