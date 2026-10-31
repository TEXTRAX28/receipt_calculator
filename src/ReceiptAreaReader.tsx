import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import ImageCropper from "./ImageCropper";
import type { ReceiptImage } from "./lib/images";
import { extractWithLocalModel } from "./lib/local-model";
import { localOcrProvider } from "./lib/ocr";
import { sourceViewport, type SourcePanel } from "./lib/receipt-evidence";

/** A fresh local text read is evidence for manual editing, never a financial edit. */
export default function ReceiptAreaReader({
  panel,
  reader,
}: {
  panel: SourcePanel;
  reader: "computer" | "device";
}) {
  const [image, setImage] = useState<ReceiptImage | null>(null);
  const [stage, setStage] = useState<
    "closed" | "select" | "read" | "result" | "error"
  >("closed");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    live.current = true;
    const url = URL.createObjectURL(panel.blob);
    const frame = sourceViewport(panel);
    setImage({
      id: crypto.randomUUID(),
      name: "receipt-area.jpg",
      blob: panel.blob,
      sourceBlob: panel.blob,
      sourceBytes: panel.blob.size,
      url,
      crop: {
        left: Math.max(
          0,
          Math.min(90, Math.floor((frame.x / panel.width) * 100)),
        ),
        top: Math.max(
          0,
          Math.min(90, Math.floor((frame.y / panel.height) * 100)),
        ),
        right: Math.max(
          0,
          Math.min(
            90,
            Math.floor((1 - (frame.x + frame.width) / panel.width) * 100),
          ),
        ),
        bottom: Math.max(
          0,
          Math.min(
            90,
            Math.floor((1 - (frame.y + frame.height) / panel.height) * 100),
          ),
        ),
      },
    });
    return () => {
      live.current = false;
      controller.current?.abort();
      URL.revokeObjectURL(url);
    };
  }, [panel]);
  useEffect(() => {
    if (stage === "select")
      root.current
        ?.querySelector<HTMLInputElement>("input[type=range]")
        ?.focus();
    else if (stage === "read")
      root.current
        ?.querySelector<HTMLButtonElement>(".cancel-area-read")
        ?.focus();
    else if (stage === "result" || stage === "error")
      root.current?.querySelector<HTMLElement>(".area-read-result")?.focus();
    else if (status) trigger.current?.focus();
  }, [stage]);

  function dismiss() {
    controller.current?.abort();
    controller.current = null;
    setStage("closed");
    setText("");
    setError("");
    setStatus("Area read closed. Your draft is unchanged.");
  }

  async function read(cropped: ReceiptImage) {
    controller.current?.abort();
    const task = new AbortController();
    controller.current = task;
    setImage(cropped);
    setText("");
    setError("");
    setStage("read");
    setStatus("Reading the selected area…");
    const active = () =>
      live.current && !task.signal.aborted && controller.current === task;
    try {
      const extract =
        reader === "computer"
          ? extractWithLocalModel
          : localOcrProvider.extract;
      const result = await extract([cropped], task.signal, (message) => {
        if (active()) setStatus(message);
      });
      if (!active()) return;
      if (!result.text.trim())
        throw new Error(
          "No readable text was found in this area. Widen the crop or edit the item below.",
        );
      setText(result.text);
      setStatus(
        "Area read finished. Compare it with the photo before editing.",
      );
      setStage("result");
    } catch (cause) {
      if (!active()) return;
      setError(
        cause instanceof Error
          ? cause.message.slice(0, 500)
          : "This area could not be read. Try another crop or edit the item below.",
      );
      setStatus("");
      setStage("error");
    } finally {
      if (controller.current === task) controller.current = null;
    }
  }

  return (
    <div className="receipt-area-reader" ref={root}>
      {stage === "closed" ? (
        <button
          ref={trigger}
          className="button button-outline full-width"
          disabled={!image}
          onClick={() => {
            setStatus("");
            setStage("select");
          }}
        >
          <ScanLine size={18} /> Reread this purchase
        </button>
      ) : stage === "select" && image ? (
        <ImageCropper
          image={image}
          title="Choose the item area"
          description={`Keep the complete purchase, quantity, price and any coupon inside the frame. This reads on ${reader === "computer" ? "this computer" : "your device"}. Compare the new text, then correct the fields below.`}
          applyLabel="Read selected area"
          onCancel={dismiss}
          onApply={(cropped) => void read(cropped)}
        />
      ) : stage === "read" ? (
        <button
          className="button button-outline cancel-area-read"
          onClick={dismiss}
        >
          Cancel area read
        </button>
      ) : (
        <div>
          <h3 className="area-read-result" tabIndex={-1}>
            {stage === "error"
              ? "This area needs another look"
              : "New reading of this area"}
          </h3>
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : (
            <pre className="area-read-text">{text}</pre>
          )}
          <p className="hint">
            Your item values and original highlight are unchanged. Check the
            photo and correct the fields below.
          </p>
          <div className="area-read-actions">
            <button
              className="button button-outline"
              onClick={() => setStage("select")}
            >
              Choose another area
            </button>
            <button className="text-button" onClick={dismiss}>
              Close new reading
            </button>
          </div>
        </div>
      )}
      <p className="hint" role="status">
        {status}
      </p>
    </div>
  );
}
