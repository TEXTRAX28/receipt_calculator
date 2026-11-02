import { useEffect, useId, useRef, useState } from "react";
import { Camera, Check, RotateCcw, X } from "lucide-react";
import { inspectCapture, type CaptureFlag } from "./lib/image-quality";
import { findReceiptEdges, type EdgeSuggestion } from "./lib/receipt-edges";

type Stage =
  "closed" | "opening" | "live" | "capturing" | "preview" | "paused" | "error";

const advice: Record<CaptureFlag, string> = {
  dark: "More light will help. Avoid a shadow over the receipt.",
  blur: "Text may be blurred. Hold still and let the camera focus.",
  "low-detail": "Text is hard to see. Check the focus and move closer.",
  "low-resolution":
    "The preview is small. Your device camera may capture more detail.",
};

/** Local, explicit capture. The guide never crops pixels or accepts financial values. */
export default function ReceiptCamera({
  disabled,
  photoNumber,
  onCapture,
  onPhotoPicker,
}: {
  disabled: boolean;
  photoNumber: number;
  onCapture: (file: File) => Promise<void>;
  onPhotoPicker: () => void;
}) {
  const titleId = useId(),
    helpId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const usePhoto = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraActive = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const encoding = useRef<HTMLCanvasElement | null>(null);
  const photo = useRef<File | null>(null);
  const photoUrl = useRef("");
  const [stage, setStage] = useState<Stage>("closed");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [edges, setEdges] = useState<EdgeSuggestion | null>(null);
  const [preview, setPreview] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const [importFinished, setImportFinished] = useState(0);

  useEffect(() => {
    if (stage === "preview") usePhoto.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (importFinished && !dialog.current?.open) trigger.current?.focus();
  }, [importFinished]);

  const active = (id: number) =>
    generation.current === id && !!dialog.current?.open;

  function stopCamera() {
    generation.current++;
    cameraActive.current = false;
    clearTimeout(timer.current);
    clearTimeout(deadline.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
    }
    if (encoding.current) {
      encoding.current.width = encoding.current.height = 1;
      encoding.current = null;
    }
  }

  function clearPhoto() {
    photo.current = null;
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = "";
    setPreview("");
    setZoomed(false);
  }

  function close() {
    stopCamera();
    clearPhoto();
    setStage("closed");
    dialog.current?.close();
    trigger.current?.focus();
  }

  useEffect(() => {
    function pause() {
      if (!cameraActive.current) return;
      stopCamera();
      setStage("paused");
      setHint("Camera paused. Start it again when you’re ready.");
    }
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pause);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pause);
      stopCamera();
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      photoUrl.current = "";
      photo.current = null;
    };
  }, []);

  function sample(id: number) {
    if (!active(id) || !cameraActive.current || document.hidden) return;
    const source = video.current;
    if (
      source &&
      source.readyState >= 2 &&
      source.videoWidth &&
      source.videoHeight
    ) {
      const flags = inspectCapture(source)?.flags || [];
      const flag = (
        ["dark", "blur", "low-detail", "low-resolution"] as const
      ).find((f) => flags.includes(f));
      setHint(
        flag
          ? advice[flag]
          : "Keep the text sharp and each row fully inside the frame.",
      );
      const canvas = document.createElement("canvas");
      try {
        const scale = Math.min(
          1,
          320 / Math.max(source.videoWidth, source.videoHeight),
        );
        canvas.width = Math.max(24, Math.round(source.videoWidth * scale));
        canvas.height = Math.max(24, Math.round(source.videoHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
          setEdges(
            findReceiptEdges(
              context.getImageData(0, 0, canvas.width, canvas.height),
            ),
          );
        }
      } catch {
        setEdges(null);
      } finally {
        canvas.width = canvas.height = 1;
      }
    }
    timer.current = setTimeout(() => sample(id), 1000);
  }

  async function start() {
    stopCamera();
    clearPhoto();
    setEdges(null);
    setError("");
    setHint("Allow camera access to frame your receipt.");
    setStage("opening");
    const id = generation.current;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStage("error");
      setError(
        "Live camera preview is unavailable here. Use your device camera or choose a photo.",
      );
      return;
    }
    if (document.hidden) {
      setStage("paused");
      setHint("Return to this screen to start the camera.");
      return;
    }
    cameraActive.current = true;
    deadline.current = setTimeout(() => {
      if (!active(id)) return;
      stopCamera();
      setStage("error");
      setError(
        "The camera hasn’t started. Check the browser’s permission prompt or use your device camera.",
      );
    }, 15000);
    try {
      const captured = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
      if (!active(id)) {
        captured.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = captured;
      for (const track of captured.getVideoTracks())
        track.addEventListener(
          "ended",
          () => {
            if (!active(id)) return;
            stopCamera();
            setStage("paused");
            setHint("The camera stopped. Start it again or choose a photo.");
          },
          { once: true },
        );
      video.current!.srcObject = captured;
      await video.current!.play();
      if (!active(id)) return;
      if (!video.current!.videoWidth || !video.current!.videoHeight)
        throw new Error("No video frame");
      clearTimeout(deadline.current);
      setStage("live");
      sample(id);
    } catch (e) {
      if (!active(id)) return;
      stopCamera();
      setStage("error");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera access wasn’t allowed. You can enable it in the browser or choose a photo."
          : "The camera is unavailable or in use. Try again, or choose a photo.",
      );
    }
  }

  function capture() {
    const source = video.current;
    if (
      stage !== "live" ||
      !cameraActive.current ||
      !source ||
      source.readyState < 2
    )
      return;
    const canvas = document.createElement("canvas");
    try {
      const width = source.videoWidth,
        height = source.videoHeight;
      if (
        width < 8 ||
        height < 8 ||
        width > 20000 ||
        height > 20000 ||
        width * height > 25_000_000
      )
        throw new Error("Unsupported camera dimensions");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Camera capture unavailable");
      context.drawImage(source, 0, 0);
      // Stop tracks immediately after taking the frame, including during review.
      stopCamera();
      encoding.current = canvas;
      const id = generation.current;
      setStage("capturing");
      deadline.current = setTimeout(() => {
        if (!active(id)) return;
        stopCamera();
        setStage("error");
        setError(
          "Saving this photo took too long. Retake it or use your device camera.",
        );
      }, 10000);
      canvas.toBlob(
        (blob) => {
          canvas.width = canvas.height = 1;
          if (encoding.current === canvas) encoding.current = null;
          if (!active(id)) return;
          clearTimeout(deadline.current);
          if (
            !blob ||
            blob.type !== "image/jpeg" ||
            !blob.size ||
            blob.size > 12 * 1024 * 1024
          ) {
            setStage("error");
            setError(
              "Couldn’t save this photo. Retake it or use your device camera.",
            );
            return;
          }
          photo.current = new File([blob], `receipt-photo-${photoNumber}.jpg`, {
            type: blob.type,
          });
          photoUrl.current = URL.createObjectURL(blob);
          setPreview(photoUrl.current);
          setStage("preview");
        },
        "image/jpeg",
        0.94,
      );
    } catch {
      canvas.width = canvas.height = 1;
      stopCamera();
      setStage("error");
      setError(
        "Couldn’t capture this frame. Try your device camera or choose a photo.",
      );
    }
  }

  async function accept() {
    const file = photo.current;
    if (!file || disabled) return;
    close();
    await onCapture(file);
    if (dialog.current) setImportFinished((value) => value + 1);
  }

  return (
    <>
      <button
        ref={trigger}
        className="button button-outline"
        disabled={disabled}
        onClick={() => {
          dialog.current?.showModal();
          void start();
        }}
      >
        <Camera size={18} />
        Take a photo
      </button>
      <dialog
        ref={dialog}
        className="camera-dialog"
        aria-labelledby={titleId}
        aria-describedby={helpId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (dialog.current?.open) return;
          stopCamera();
          clearPhoto();
          setStage("closed");
        }}
      >
        <div className="camera-heading">
          <h2 id={titleId}>
            {stage === "preview" ? "Check your photo" : "Frame your receipt"}
          </h2>
          <button
            className="icon-button"
            aria-label="Close camera"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <p id={helpId}>
          Photo {photoNumber}. For a long receipt, overlap 3–5 complete rows
          with the previous photo. Include the total and VAT table in the last
          one.
        </p>
        <div
          className={`camera-viewport${zoomed ? " is-zoomed" : ""}`}
          hidden={stage === "error" || stage === "paused"}
          tabIndex={zoomed ? 0 : undefined}
          role="region"
          aria-label={
            zoomed
              ? "Photo inspection. Scroll to see each part."
              : "Receipt camera image"
          }
        >
          <div className="camera-frame">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label="Live receipt camera preview"
              hidden={stage === "preview"}
            />
            {preview && (
              <img src={preview} alt="Photo to check before adding" />
            )}
            {stage === "live" && edges && (
              <div
                className="camera-paper-guide"
                aria-hidden="true"
                style={{
                  left: `${edges.bounds.left}%`,
                  top: `${edges.bounds.top}%`,
                  right: `${edges.bounds.right}%`,
                  bottom: `${edges.bounds.bottom}%`,
                }}
              />
            )}
          </div>
        </div>
        {stage === "preview" ? (
          <p className="camera-hint">
            Check that the text is readable and no rows are cut off.
          </p>
        ) : (
          <p className="camera-hint" role="status" aria-label="Camera guidance">
            {stage === "capturing" ? "Saving your photo…" : hint}
          </p>
        )}
        {stage === "live" && (
          <p className="camera-guide-note">
            The guide is approximate. Your full photo is kept.
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="camera-actions">
          {stage === "live" && (
            <button className="button button-primary" onClick={capture}>
              <Camera size={18} />
              Capture photo
            </button>
          )}
          {stage === "preview" && (
            <>
              <button
                ref={usePhoto}
                className="button button-primary"
                onClick={() => void accept()}
                disabled={disabled}
              >
                <Check size={18} />
                Use photo
              </button>
              <button
                className="button button-outline"
                aria-pressed={zoomed}
                onClick={() => setZoomed((value) => !value)}
              >
                {zoomed ? "Fit photo" : "Inspect text"}
              </button>
              <button
                className="button button-outline"
                onClick={() => void start()}
              >
                <RotateCcw size={18} />
                Retake
              </button>
            </>
          )}
          {(stage === "error" || stage === "paused") && (
            <button
              className="button button-primary"
              onClick={() => void start()}
            >
              Start camera again
            </button>
          )}
          <button
            className="button button-outline"
            onClick={() => {
              close();
              onPhotoPicker();
            }}
          >
            Choose or take a photo
          </button>
        </div>
        <p className="camera-privacy">
          The camera preview stays on this device. A photo is added only when
          you choose Use photo.
        </p>
      </dialog>
    </>
  );
}
