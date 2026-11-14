import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  firstReceiptIssue,
  focusValidationIssue,
  openValidationDetails,
  type ValidationIssue,
} from "./lib/review-validation";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Heart,
  ImagePlus,
  Leaf,
  LoaderCircle,
  Plus,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Users,
  X,
  CircleHelp,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import {
  currencies,
  finalStamp,
  newItem,
  newState,
  receiptStamp,
  uid,
  type AppState,
  type Assignment,
  type Item,
  type Receipt,
} from "./lib/model";
import {
  assignmentWeights,
  calculateReceipt,
  calculateSplit,
  removePerson,
  type ReceiptResult,
  type Issue,
} from "./lib/engine";
import { formatReceiptMoney, weight, SCALE } from "./lib/money";
import { costcoDemo } from "./lib/demo";
import { parseReceiptText } from "./lib/parser";
import { readingBlobs, type ReceiptImage } from "./lib/images";
import { prepareReceiptFile } from "./lib/receipt-files";
import { extractWithOpenAi, openaiConfiguration } from "./lib/openai";
import {
  applyItemEdit,
  applyReceiptEdit,
  checkIsPending,
} from "./lib/review-checks";
import {
  MAX_RECEIPT_IMAGES,
  MAX_BATCH_BYTES,
  MAX_READING_PANELS,
} from "./lib/scan-limits.mjs";
import { loadDraft, saveDraft, STORAGE_KEY } from "./lib/storage";
import { readableSummary } from "./lib/summary";
import ImageCropper from "./ImageCropper";
import ReviewChecks from "./ReviewChecks";
import ReceiptSnapshot from "./ReceiptSnapshot";
import {
  reconcileObservedUnits,
  prepareSavedReceiptReview,
} from "./lib/receipt-reconciliation";
import PhotoGuidance from "./PhotoGuidance";
import ReceiptPhotos from "./ReceiptPhotos";
import ReceiptCamera from "./ReceiptCamera";
import { requireCorrectedPhotoReview } from "./lib/capture-review";
import RefundControl from "./RefundControl";
type Step = AppState["step"];
const steps: { id: Step; title: string }[] = [
  { id: "scan", title: "Receipt" },
  { id: "review", title: "Review" },
  { id: "people", title: "People" },
  { id: "assign", title: "Share" },
  { id: "summary", title: "Summary" },
];
const colorNames = ["sage", "peach", "blue", "lilac", "sand", "rose"];
const displayName = (name: string, index: number) =>
  `${name} (person ${index + 1})`;
function Field({
  label,
  children,
  hint,
  error,
  action,
  path,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  action?: ReactNode;
  path?: string;
}) {
  const controlId = useId();
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          "aria-describedby"?: string;
          "aria-invalid"?: boolean;
        }>,
        {
          id: controlId,
          "aria-describedby":
            [hint ? `${controlId}-hint` : "", error ? `${controlId}-error` : ""]
              .filter(Boolean)
              .join(" ") || undefined,
          "aria-invalid": error ? true : undefined,
        },
      )
    : children;
  return (
    <div
      className={`field${error ? " field-invalid" : ""}`}
      data-validation-path={path}
    >
      <label htmlFor={controlId}>{label}</label>
      {action ? (
        <div className="field-control">
          {control}
          {action}
        </div>
      ) : (
        control
      )}
      {hint && <small id={`${controlId}-hint`}>{hint}</small>}
      {error && (
        <small className="field-error" id={`${controlId}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}
function MoneyInput({
  label,
  displayLabel,
  value,
  onChange,
  hint,
  error,
  signed = false,
  path,
  placeholder = "0.00",
  ...rest
}: {
  label: string;
  displayLabel?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  signed?: boolean;
  path?: string;
  placeholder?: string;
}) {
  return (
    <Field
      label={displayLabel || label}
      hint={hint}
      error={error}
      path={path}
      action={
        signed ? (
          <button
            type="button"
            className="button button-outline amount-sign"
            aria-label={`Change sign (+/−) for ${label}`}
            title="Switch between a positive amount and a credit"
            disabled={!/^-?\d{1,12}(?:\.\d{1,6})?$/.test(value.trim())}
            onClick={() =>
              onChange(
                value.trim().startsWith("-")
                  ? value.trim().slice(1)
                  : `-${value.trim()}`,
              )
            }
          >
            +/−
          </button>
        ) : undefined
      }
    >
      <input
        {...rest}
        aria-label={label}
        inputMode="decimal"
        maxLength={40}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}
function Avatar({
  name,
  index,
  small = false,
}: {
  name: string;
  index: number;
  small?: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`avatar ${colorNames[index % colorNames.length]} ${small ? "small" : ""}`}
    >
      {initials || "?"}
    </span>
  );
}
function SectionIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="section-intro">
      <span className="eyebrow">{eyebrow}</span>
      <h1 tabIndex={-1} id="screen-title">
        {title}
      </h1>
      <p>{children}</p>
    </div>
  );
}

export default function App() {
  const initial = useMemo(() => {
    try {
      const draft = loadDraft(localStorage);
      return { ...draft, state: prepareSavedReceiptReview(draft.state) };
    } catch {
      return {
        state: newState(),
        warning:
          "Local storage is unavailable. Keep this tab open to preserve your draft.",
      };
    }
  }, []);
  const [state, setState] = useState<AppState>(initial.state);
  const [notice, setNotice] = useState(initial.warning);
  const [saveError, setSaveError] = useState("");
  const storageConflict = useRef(false);
  const [images, setImages] = useState<ReceiptImage[]>([]);
  const imageRef = useRef<ReceiptImage[]>([]);
  const [imageError, setImageError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const busyRef = useRef(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanCurrency, setScanCurrency] = useState<Receipt["currency"] | "">(
    "",
  );
  const readingContext = scanCurrency ? { currency: scanCurrency } : undefined;
  const [aiConsented, setAiConsented] = useState(false);
  const [checkingAi, setCheckingAi] = useState(false);
  const [openaiConfig, setOpenaiConfig] = useState<Awaited<
    ReturnType<typeof openaiConfiguration>
  > | null>(null);
  const canScan = aiConsented && openaiConfig?.configured && !checkingAi;
  const controller = useRef<AbortController | null>(null);
  const [rawText, setRawText] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [zoomImage, setZoomImage] = useState<ReceiptImage | null>(null);
  const [cropTarget, setCropTarget] = useState<ReceiptImage | null>(null);
  const [personName, setPersonName] = useState("");
  const [validation, setValidation] = useState<
    (ValidationIssue & { step: Step }) | null
  >(null);
  const [validationAttempted, setValidationAttempted] = useState<Step | null>(
    null,
  );
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const result = useMemo(
    () => calculateSplit(state, { readingNotes: "advisory" }),
    [state],
  );
  const receiptResult = result.receipt;
  const receiptError = (path: string) =>
    validationAttempted === "review"
      ? receiptResult.issues.find((issue) => issue.path === path)?.message ||
        (validation?.step === "review" &&
        validation.path === path &&
        result.issues.some((issue) => issue.message === validation.message)
          ? validation.message
          : undefined)
      : undefined;
  const peopleIssues: Issue[] = !state.people.length
    ? [
        {
          path: "people",
          message: "Add at least one person before sharing the bill.",
        },
      ]
    : state.people.flatMap((person, index) =>
        person.name.trim()
          ? []
          : [
              {
                path: `people.${index}.name`,
                message: `Enter a name for person ${index + 1}.`,
              },
            ],
      );
  function showValidation(issues: Issue[], step: Step = state.step) {
    const selected =
      step === "review"
        ? firstReceiptIssue(state.receipt, issues)
        : issues[0]
          ? { ...issues[0], review: false }
          : undefined;
    if (!selected) return;
    flushSync(() => {
      setValidationAttempted(step);
      setValidation({ ...selected, step });
      if (state.step !== step) setState((value) => ({ ...value, step }));
    });
    flushSync(() => openValidationDetails(document, selected.path));
    if (!focusValidationIssue(document, selected)) setNotice(selected.message);
  }
  function continueReview() {
    const checked = calculateReceipt(state.receipt, {
      readingNotes: "advisory",
    });
    if (checked.issues.length) {
      showValidation(checked.issues, "review");
      return;
    }
    setValidation(null);
    setValidationAttempted(null);
    setState((value) => ({
      ...value,
      reviewedStamp: receiptStamp(value.receipt),
      step: "people",
    }));
    window.scrollTo(0, 0);
  }
  const f = (amount: bigint) => formatReceiptMoney(amount, state.receipt);
  const finalized =
    state.finalizedStamp !== "" &&
    state.finalizedStamp === finalStamp(state) &&
    result.canFinalize;
  useEffect(() => setAiConsented(false), [images]);
  useEffect(() => {
    const check = new AbortController();
    setCheckingAi(true);
    openaiConfiguration(
      AbortSignal.any([check.signal, AbortSignal.timeout(5000)]),
    )
      .then((config) => {
        if (!check.signal.aborted) setOpenaiConfig(config);
      })
      .catch(() => {
        if (!check.signal.aborted) setOpenaiConfig(null);
      })
      .finally(() => {
        if (!check.signal.aborted) setCheckingAi(false);
      });
    return () => check.abort();
  }, []);
  useEffect(() => {
    imageRef.current = images;
  }, [images]);
  useEffect(
    () => () => {
      controller.current?.abort();
      imageRef.current.forEach((i) => URL.revokeObjectURL(i.url));
    },
    [],
  );
  useEffect(() => {
    const changedElsewhere = (event: StorageEvent) => {
      if (
        (event.key === STORAGE_KEY || event.key === null) &&
        event.newValue !== event.oldValue
      ) {
        storageConflict.current = true;
        setSaveError(
          "Another Gather tab changed this draft. This tab has stopped saving to protect both versions. Export your summary before reloading to use the other tab's version.",
        );
      }
    };
    window.addEventListener("storage", changedElsewhere);
    return () => window.removeEventListener("storage", changedElsewhere);
  }, []);
  useEffect(() => {
    if (storageConflict.current) return;
    try {
      saveDraft(localStorage, state);
      setSaveError("");
    } catch {
      setSaveError(
        "Draft could not be saved on this device. Keep this tab open and export your summary before leaving.",
      );
    }
  }, [state]);
  useEffect(() => {
    if (privacy || zoomImage || cropTarget) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [privacy, zoomImage, cropTarget]);
  useEffect(() => {
    if (validation?.step === state.step) return;
    document.getElementById("screen-title")?.focus({ preventScroll: true });
  }, [state.step]);
  const navigate = (step: Step) => {
    setValidation(null);
    setValidationAttempted(null);
    setState((s) => ({ ...s, step }));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const editReceipt = (change: Partial<Receipt>) =>
    setState((s) => ({
      ...s,
      receipt: reconcileObservedUnits(applyReceiptEdit(s.receipt, change)),
      finalizedStamp: "",
    }));
  const editItem = (id: string, change: Partial<Item>) =>
    setState((s) => ({
      ...s,
      receipt: reconcileObservedUnits(applyItemEdit(s.receipt, id, change)),
      finalizedStamp: "",
    }));
  const replaceReceipt = (receipt: Receipt) => {
    setState((s) => ({
      ...newState(),
      people: s.people,
      receipt: reconcileObservedUnits(receipt),
      step: "review",
    }));
    setNotice("");
    window.scrollTo(0, 0);
  };
  const canReplace = () =>
    !state.receipt.items.length ||
    window.confirm(
      "Replace this receipt? Your current receipt and assignments will be removed.",
    );
  const loadDemo = () => {
    if (canReplace()) replaceReceipt(costcoDemo());
  };
  const startManual = () => {
    if (canReplace()) {
      const fresh = newState().receipt;
      fresh.items = [newItem()];
      replaceReceipt(fresh);
    }
  };
  const reset = () => {
    if (
      !window.confirm(
        "Delete this receipt, its people and assignments from this device?",
      )
    )
      return;
    controller.current?.abort();
    storageConflict.current = false;
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
    setScanCurrency("");
    setRawText("");
    setImageError("");
    setAiConsented(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Storage unavailable: memory is still cleared. */
    }
    setState(newState());
    setNotice("Receipt deleted. A fresh start.");
  };
  async function addFiles(files: FileList | File[] | null) {
    if (!files || busyRef.current) return;
    if (files.length + images.length > MAX_RECEIPT_IMAGES) {
      setImageError(
        `Choose at most ${MAX_RECEIPT_IMAGES} images or PDF pages for one receipt. Photograph long receipts from top to bottom, overlapping a few rows.`,
      );
      return;
    }
    if (
      Array.from(files).reduce((sum, file) => sum + file.size, 0) +
        images.reduce(
          (sum, image) => sum + (image.sourceBytes || image.blob.size),
          0,
        ) >
      MAX_BATCH_BYTES
    ) {
      setImageError(
        "Choose up to 48 MB of receipt files for one receipt. Crop images or import a smaller PDF first.",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setImageError("");
    setImporting(true);
    setScanStatus("Preparing receipt files…");
    controller.current = new AbortController();
    const prepared: ReceiptImage[] = [];
    try {
      for (const file of Array.from(files)) {
        prepared.push(
          ...(await prepareReceiptFile(file, {
            remaining: MAX_RECEIPT_IMAGES - images.length - prepared.length,
            signal: controller.current.signal,
            progress: setScanStatus,
          })),
        );
        controller.current.signal.throwIfAborted();
        if (
          [...images, ...prepared].reduce(
            (sum, image) => sum + readingBlobs(image).length,
            0,
          ) > MAX_READING_PANELS
        )
          throw new Error(
            "This receipt has more than 24 detail sections. Import fewer pages or crop the images first.",
          );
        if (
          [...images, ...prepared].reduce(
            (sum, image) => sum + (image.sourceBytes || image.blob.size),
            0,
          ) > MAX_BATCH_BYTES
        )
          throw new Error(
            "The prepared receipt exceeds 48 MB. Import fewer pages or smaller images.",
          );
      }
      setImages((previous) => [...previous, ...prepared]);
      setAiConsented(false);
    } catch (e) {
      prepared.forEach((i) => URL.revokeObjectURL(i.url));
      setImageError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setImporting(false);
      setScanStatus("");
      controller.current = null;
      if (uploadRef.current) uploadRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }
  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (busyRef.current || target < 0 || target >= images.length) return;
    setImages((current) => {
      const ordered = [...current];
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered;
    });
    setAiConsented(false);
  }
  async function scan() {
    if (busyRef.current || !images.length || !canScan || !canReplace()) return;
    busyRef.current = true;
    setBusy(true);
    setAiConsented(false);
    setImageError("");
    const scanController = new AbortController();
    controller.current = scanController;
    try {
      const receipt = await extractWithOpenAi(
        images,
        scanController.signal,
        setScanStatus,
        readingContext,
      );
      replaceReceipt(
        requireCorrectedPhotoReview(
          receipt,
          images.some((image) => !!image.geometry),
        ),
      );
      setNotice("Receipt ready to review.");
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "The scan could not finish. Your photos are still available. You can enter the receipt manually.",
      );
    } finally {
      controller.current = null;
      await openaiConfiguration(AbortSignal.timeout(5000))
        .then(setOpenaiConfig)
        .catch(() => setOpenaiConfig(null));
      busyRef.current = false;
      setBusy(false);
      setScanStatus("");
    }
  }
  function parseText() {
    if (!canReplace()) return;
    try {
      replaceReceipt(parseReceiptText(rawText, readingContext));
      setImageError("");
    } catch {
      setImageError(
        "Could not interpret this text. Use 1–60,000 characters, check the receipt lines, or enter the items manually.",
      );
    }
  }
  function finalize() {
    const checked = calculateSplit(state, { readingNotes: "advisory" });
    if (!checked.canFinalize) {
      if (checked.receipt.issues.length)
        showValidation(checked.receipt.issues, "review");
      else if (peopleIssues.length) showValidation(peopleIssues, "people");
      else if (state.reviewedStamp !== receiptStamp(state.receipt))
        showValidation(
          [
            {
              path: "review",
              message:
                "Confirm the corrected receipt before finalizing the split.",
            },
          ],
          "review",
        );
      else showValidation(checked.issues, "assign");
      return;
    }
    setValidation(null);
    setValidationAttempted(null);
    setState((s) => ({ ...s, finalizedStamp: finalStamp(s), step: "summary" }));
    window.scrollTo(0, 0);
  }
  function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const name = personName.trim();
    if (!name || state.people.length >= 30) return;
    setState((s) => ({
      ...s,
      people: [...s.people, { id: uid(), name }],
      finalizedStamp: "",
    }));
    setPersonName("");
  }
  async function copySummary() {
    try {
      await navigator.clipboard.writeText(readableSummary(state));
      setNotice("Summary copied. Ready for the group chat.");
    } catch {
      setNotice(
        "Clipboard access is unavailable. Use Download summary to save the same text.",
      );
    }
  }
  function downloadSummary() {
    const url = URL.createObjectURL(
      new Blob([readableSummary(state)], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "gather-summary.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const assigned = [...result.statuses.values()].filter(
    (s) => s.status === "complete",
  ).length;
  const assignmentCount =
    state.splitMode === "whole" ? 1 : state.receipt.items.length;
  const sidePanel = (
    <aside className="side-panel">
      <div className="paper-summary">
        <div className="paper-top">
          <ReceiptText size={24} />
          <span>YOUR SHARED SHOP</span>
        </div>
        <h2>
          {state.receipt.merchant.trim() ||
            (state.receipt.items.length
              ? "Unnamed receipt"
              : "A new adventure")}
        </h2>
        <span className="muted">
          {state.receipt.date || "Receipt draft"} ·{" "}
          {state.receipt.currencyUnresolved
            ? "Choose currency"
            : state.receipt.currency}
        </span>
        <div className="receipt-dashes" />
        <SummaryRows receipt={state.receipt} result={receiptResult} />
        <div className="receipt-dashes" />
        <div className="grand-total">
          <span>Receipt total</span>
          <strong>{f(receiptResult.printed ?? receiptResult.total)}</strong>
        </div>
        <div
          className={`balance-label ${receiptResult.issues.length ? "needs-check" : ""}`}
        >
          {receiptResult.issues.length ? (
            <AlertCircle size={16} />
          ) : (
            <CheckCheck size={17} />
          )}
          {receiptResult.issues.length
            ? "Details need a check"
            : "Receipt balances to the penny"}
        </div>
        {state.receipt.source === "demo" && (
          <span className="demo-tag">DEMO · MANUAL TRANSCRIPTION</span>
        )}
      </div>
      {state.people.length > 0 && (
        <div className="live-totals">
          <div className="mini-heading">
            <h3>Everyone’s share</h3>
            <span>LIVE</span>
          </div>
          {result.totals.map((person, i) => (
            <div className="live-person" key={person.person.id}>
              <Avatar name={person.person.name} index={i} small />
              <span>
                {person.person.name}
                <small>Person {i + 1}</small>
              </span>
              <strong data-testid={`live-total-${i}`}>{f(person.total)}</strong>
            </div>
          ))}
          <p className="hint">
            {assigned}/{assignmentCount} fully assigned · draft amounts update
            as you go.
          </p>
        </div>
      )}
      <div className="small-note">
        <ShieldCheck size={18} />
        <p>
          Original photos are kept in memory. OpenAI scans send receipt sections
          to the selected provider only with your agreement. The editable draft
          is saved in this browser.
        </p>
      </div>
      {images.length > 0 ? (
        <div className="original-images">
          <h3>Original receipt</h3>
          <div>
            {images.map((image, i) => (
              <button
                key={image.id}
                className="original-thumb"
                onClick={() => setZoomImage(image)}
                aria-label={`View original receipt image ${i + 1}`}
              >
                <img src={image.url} alt={`Original receipt image ${i + 1}`} />
                <span>View {i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        ["ocr", "ai"].includes(state.receipt.source) && (
          <p className="hint">
            Photos are kept only in memory. Upload them again after a refresh to
            compare the original.
          </p>
        )
      )}
    </aside>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("scan");
          }}
          aria-label="Gather home"
        >
          <span className="brand-mark">
            <ShoppingBasket size={24} strokeWidth={1.8} />
          </span>
          gather<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Help">
          <button
            className="text-button"
            onClick={() => {
              setPrivacy(true);
            }}
          >
            Privacy first <ShieldCheck size={15} />
          </button>
          <button
            className="button button-quiet new-receipt"
            aria-label="New receipt"
            disabled={busy}
            onClick={reset}
          >
            <Plus size={17} />
            <span className="new-receipt-label">New receipt</span>
          </button>
        </nav>
      </header>
      <main
        id="main"
        className={`app-main ${state.step === "scan" ? "scan-page" : ""}`}
      >
        <nav className="stepper" aria-label="Receipt workflow">
          {steps.map((step, i) => (
            <button
              key={step.id}
              className={`step ${state.step === step.id ? "active" : ""} ${steps.findIndex((s) => s.id === state.step) > i ? "past" : ""}`}
              aria-current={state.step === step.id ? "step" : undefined}
              disabled={busy || (i > 0 && state.receipt.items.length === 0)}
              onClick={() => navigate(step.id)}
            >
              <span className="step-number">
                {steps.findIndex((s) => s.id === state.step) > i ? (
                  <Check size={13} />
                ) : (
                  i + 1
                )}
              </span>
              <span>{step.title}</span>
            </button>
          ))}
        </nav>
        {(notice || saveError) && (
          <div role="status" className={`notice ${saveError ? "warning" : ""}`}>
            <span>{saveError || notice}</span>
            {notice && !saveError && (
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {state.step === "scan" ? (
          <>
            <SectionIntro
              eyebrow="GOOD COMPANY. FAIR SHARES."
              title="Big shop. Little maths."
            >
              From the trolley to the group chat. Turn one receipt into
              everyone’s fair share.
            </SectionIntro>
            <div className="scan-layout">
              <section className="upload-card" aria-label="Start a receipt">
                <div className="card-kicker">
                  <span className="icon-disc">
                    <ScanLine size={20} />
                  </span>
                  <span>Let’s start with your receipt</span>
                  <span className="pill">NO ACCOUNT NEEDED</span>
                </div>
                <div
                  className="drop-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void addFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="upload-orbit">
                    <ReceiptText size={37} strokeWidth={1.4} />
                    <span className="orbit-plus">
                      <Plus size={15} />
                    </span>
                  </div>
                  <h2>One shop. Every section.</h2>
                  <p>
                    Drop your receipt here, or choose photos or a PDF.
                    <br />
                    Long receipt? Add up to {MAX_RECEIPT_IMAGES} overlapping
                    photos.
                  </p>
                  <div className="upload-actions">
                    <button
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => uploadRef.current?.click()}
                    >
                      <ImagePlus size={18} />
                      Upload receipt
                    </button>
                    <ReceiptCamera
                      disabled={busy || images.length >= MAX_RECEIPT_IMAGES}
                      photoNumber={images.length + 1}
                      onCapture={(file) => addFiles([file])}
                      onPhotoPicker={() => cameraRef.current?.click()}
                    />
                  </div>
                  <span className="file-help">
                    JPEG, PNG, WebP or PDF · up to 12 MB each
                  </span>
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    className="visually-hidden"
                    aria-label="Upload receipt images"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="visually-hidden"
                    aria-label="Take receipt photo"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                </div>
                <div className="capture-guide">
                  <h3>A long Costco receipt is welcome.</h3>
                  <ol>
                    <li>
                      Start at the top. Take close-up photos down the receipt.
                    </li>
                    <li>
                      Repeat 3–5 complete item rows between neighboring photos.
                    </li>
                    <li>
                      Include the final total and VAT table in the last photo.
                    </li>
                  </ol>
                  <p>
                    Keep the text sharp and the receipt flat. You can add photos
                    one at a time, crop the background and change their order
                    below. A tall image is read in detail sections
                    automatically.
                  </p>
                </div>
                {images.length > 0 && (
                  <div className="selected-images">
                    {images.map((image, i) => (
                      <div key={image.id} className="selected-image">
                        <button
                          disabled={busy}
                          onClick={() => setZoomImage(image)}
                          aria-label={`Preview image ${i + 1}`}
                        >
                          <img
                            src={image.url}
                            alt={`Receipt preview ${i + 1}`}
                          />
                        </button>
                        <span>
                          {image.document
                            ? `PDF page ${image.document.page}`
                            : `Image ${i + 1}`}
                          {image.crop ? " · cropped" : ""}
                          {image.geometry ? " · corrected" : ""}
                          {image.panels
                            ? ` · ${image.panels.length} sections`
                            : ""}
                        </span>
                        <div className="image-order">
                          <button
                            className="photo-order-button"
                            disabled={busy || i === 0}
                            aria-label={`Move image ${i + 1} earlier`}
                            onClick={() => moveImage(i, -1)}
                          >
                            <ArrowLeft size={17} />
                          </button>
                          <button
                            className="photo-order-button"
                            disabled={busy || i === images.length - 1}
                            aria-label={`Move image ${i + 1} later`}
                            onClick={() => moveImage(i, 1)}
                          >
                            <ArrowRight size={17} />
                          </button>
                        </div>
                        <button
                          className="text-button crop-trigger"
                          disabled={busy}
                          aria-label={`Crop image ${i + 1}`}
                          onClick={() => setCropTarget(image)}
                        >
                          Crop
                        </button>
                        <button
                          disabled={busy}
                          className="icon-button"
                          aria-label={`Remove image ${i + 1}`}
                          onClick={() => {
                            URL.revokeObjectURL(image.url);
                            setImages(images.filter((p) => p.id !== image.id));
                            setAiConsented(false);
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {images.length > 0 && (
                  <p className="hint">
                    {images.length} of {MAX_RECEIPT_IMAGES} images or pages ·
                    Keep them in top-to-bottom order. Crop away the background
                    for a clearer result.
                  </p>
                )}
                <PhotoGuidance images={images} />
                <Field label="Receipt currency (optional)">
                  <select
                    value={scanCurrency}
                    disabled={busy || importing}
                    onChange={(event) => {
                      setScanCurrency(
                        event.target.value as Receipt["currency"] | "",
                      );
                      setAiConsented(false);
                    }}
                  >
                    <option value="">Read from receipt</option>
                    {Object.keys(currencies).map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </Field>
                <p className="hint">
                  Your selection fills missing currency details and helps
                  interpret printed text. It does not convert prices.
                  Conflicting currency and unclear amounts still need checking.
                </p>
                {imageError && (
                  <p className="inline-error" role="alert">
                    <AlertCircle size={17} />
                    {imageError}
                  </p>
                )}
                <fieldset className="reader-choice" disabled={busy}>
                  <legend>OpenAI scan</legend>
                  <div className="ai-reader-info">
                    <p>
                      Gather sends the selected receipt photos and rendered PDF
                      pages to OpenAI to prepare an editable receipt.
                    </p>
                    <p className="hint" role="status">
                      {checkingAi
                        ? "Checking the app's OpenAI allowance…"
                        : openaiConfig?.configured
                          ? `App allowance: ${openaiConfig.remaining} scan ${openaiConfig.remaining === 1 ? "attempt" : "attempts"} remaining. Failed or cancelled attempts can still use credits.`
                          : openaiConfig?.availability === "missing-key"
                            ? "Add a server-side OpenAI API key and restart Gather."
                            : openaiConfig?.availability === "missing-allowance"
                              ? "Set the app’s OpenAI scan allowance and restart Gather."
                              : openaiConfig?.availability === "exhausted"
                                ? "The app’s OpenAI scan allowance is used up."
                                : "OpenAI scanning is unavailable. Check the local server and its allowance storage."}
                    </p>
                    <p className="hint">
                      The app accepts scans estimated at US$0.60 or less. OpenAI
                      bills actual usage.
                    </p>
                    <p className="hint">
                      Crop out membership and payment details. OpenAI API
                      content is excluded from training by default, but safety
                      logs and caching can retain content and processing may
                      occur outside your country. Gather does not save these
                      photos or model requests.{" "}
                      <a
                        href="https://developers.openai.com/api/docs/guides/your-data"
                        target="_blank"
                        rel="noreferrer"
                      >
                        OpenAI’s data-use information
                      </a>
                    </p>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={aiConsented}
                        disabled={checkingAi || !openaiConfig?.configured}
                        onChange={(event) =>
                          setAiConsented(event.target.checked)
                        }
                      />
                      Send these receipt sections to OpenAI and use API credits
                      for this scan. I have read the notice above.
                    </label>
                  </div>
                </fieldset>
                {(images.length > 0 || importing) && (
                  <div className="scan-controls">
                    <button
                      className="button button-primary full-width"
                      disabled={busy || !canScan}
                      onClick={() => void scan()}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <ScanLine size={18} />
                      )}
                      {busy
                        ? scanStatus || "Preparing images…"
                        : "Read receipt with OpenAI credits"}
                      {!busy && <ArrowRight size={17} />}
                    </button>
                    {busy && controller.current && (
                      <button
                        className="text-button"
                        onClick={() => controller.current?.abort()}
                      >
                        {importing ? "Cancel import" : "Cancel scan"}
                      </button>
                    )}
                  </div>
                )}
                <div className="or-divider">
                  <span>or</span>
                </div>
                <div className="alternate-actions">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={startManual}
                  >
                    <FileText size={17} />
                    Enter manually
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={loadDemo}
                  >
                    <Sparkles size={17} />
                    Try the Costco demo
                    <ArrowRight size={15} />
                  </button>
                </div>
                <details className="text-import">
                  <summary>Already have receipt text?</summary>
                  <label className="field">
                    <span>Paste receipt text (up to 60,000 characters)</span>
                    <textarea
                      aria-label="Receipt text"
                      rows={6}
                      maxLength={60000}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                    />
                  </label>
                  <button
                    className="button button-outline"
                    disabled={busy || !rawText.trim()}
                    onClick={parseText}
                  >
                    Review this text
                    <ArrowRight size={16} />
                  </button>
                  <p className="hint">
                    Pasted text is processed on this device. You can edit every
                    field before splitting.
                  </p>
                </details>
              </section>
              <aside className="welcome-aside">
                <div className="receipt-illustration" aria-hidden="true">
                  <span className="floating-label peach">
                    <Heart size={13} /> sharing looks good on you
                  </span>
                  <div className="illustration-paper">
                    <ShoppingBasket size={25} />
                    <strong>THE GOOD COMPANY SHOP</strong>
                    <small>one lovely shared adventure</small>
                    <div className="receipt-dashes" />
                    <div>
                      <span>Something for you</span>
                      <span>✓</span>
                    </div>
                    <div>
                      <span>Something for them</span>
                      <span>✓</span>
                    </div>
                    <div>
                      <span>A little for everyone</span>
                      <span>✓</span>
                    </div>
                    <div className="receipt-dashes" />
                    <div className="illustration-total">
                      <span>Good times</span>
                      <strong>100%</strong>
                    </div>
                    <div className="barcode" />
                  </div>
                  <span className="floating-label sage">
                    <CheckCheck size={15} /> every penny, accounted for
                  </span>
                  <Leaf className="leaf-decor" size={52} strokeWidth={1.1} />
                </div>
                <div className="welcome-note">
                  <span className="eyebrow">LESS “WHO HAD WHAT?”</span>
                  <h2>
                    More sharing.
                    <br />
                    Less spreadsheet.
                  </h2>
                  <p>
                    Groceries with housemates, a weekend away, or one very full
                    Costco trolley. We’ll help you untangle the receipt.
                  </p>
                </div>
                <div className="feature-pills">
                  <span>
                    <Users size={15} />
                    Split your way
                  </span>
                  <span>
                    <CheckCheck size={15} />
                    Penny-perfect totals
                  </span>
                </div>
              </aside>
            </div>
            <div className="how-it-works">
              <div>
                <span>01</span>
                <h3>Bring the receipt</h3>
                <p>Snap, upload, or type it in.</p>
              </div>
              <ArrowRight size={20} />
              <div>
                <span>02</span>
                <h3>Give it a quick check</h3>
                <p>Catch discounts, tax, and little details.</p>
              </div>
              <ArrowRight size={20} />
              <div>
                <span>03</span>
                <h3>Share the good stuff</h3>
                <p>Pick people. See exactly what they owe.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <SectionIntro
              eyebrow={
                state.receipt.source === "demo"
                  ? "COSTCO DEMO · NOT AN OCR RESULT"
                  : "ONE SHOP, SHARED YOUR WAY"
              }
              title={
                state.step === "review"
                  ? "Your receipt."
                  : state.step === "people"
                    ? "Who’s in on the shop?"
                    : state.step === "assign"
                      ? "A little for you. A little for them."
                      : finalized
                        ? "Every penny has a home."
                        : "Here’s where things stand."
              }
            >
              {state.step === "review"
                ? "Your digital receipt. Make any corrections, then continue to share the bill."
                : state.step === "people"
                  ? "Housemates, friends, family. Add a name for everyone sharing this receipt."
                  : state.step === "assign"
                    ? "Tick who shares each item. Use quantities or custom shares when you need them."
                    : finalized
                      ? "Your receipt balances, and everyone has a clear share. Ready for the group chat."
                      : "These are draft amounts. Resolve the remaining details before finalizing."}
            </SectionIntro>
            <div
              className={`workspace${state.step === "review" ? " workspace-receipt" : ""}`}
            >
              <div className="workspace-main">
                {state.step === "review" && (
                  <>
                    <ReceiptSnapshot
                      receipt={state.receipt}
                      result={receiptResult}
                      onViewOriginal={
                        images.length
                          ? () => setZoomImage(images[0])
                          : undefined
                      }
                      onEdit={(path) => {
                        const editor = document.getElementById(
                          "receipt-editor",
                        ) as HTMLDetailsElement;
                        editor.open = true;
                        flushSync(() => openValidationDetails(document, path));
                        const field = Array.from(
                          editor.querySelectorAll<HTMLElement>(
                            "[data-validation-path]",
                          ),
                        ).find((node) => node.dataset.validationPath === path);
                        const control = field?.querySelector<HTMLElement>(
                          "input, select, textarea",
                        );
                        control?.focus({ preventScroll: true });
                        control?.scrollIntoView({ block: "center" });
                      }}
                    />
                    <details
                      id="receipt-editor"
                      className="receipt-editor-disclosure"
                      open={state.receipt.source === "manual"}
                    >
                      <summary>Edit fields and receipt text</summary>
                      {state.receipt.warnings.length > 0 && (
                        <details className="review-notes">
                          <summary>
                            <CircleHelp size={18} />A few things to check
                          </summary>
                          <ul>
                            {state.receipt.warnings.map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <section className="panel">
                        {images.length > 0 && (
                          <div className="review-image-links">
                            {images.map((image, index) => (
                              <button
                                className="button button-outline"
                                key={image.id}
                                onClick={() => setZoomImage(image)}
                              >
                                <ReceiptText size={16} />
                                View receipt image {index + 1}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="panel-heading">
                          <h2>The receipt details</h2>
                          <span className="pill">
                            {state.receipt.currencyUnresolved
                              ? "Currency needed"
                              : state.receipt.currency}
                          </span>
                        </div>
                        <div className="form-grid metadata">
                          <Field
                            label="Merchant"
                            path="merchant"
                            error={receiptError("merchant")}
                            hint="Optional. Leave blank if the name is missing or unreadable."
                          >
                            <input
                              maxLength={100}
                              value={state.receipt.merchant}
                              onChange={(e) =>
                                editReceipt({ merchant: e.target.value })
                              }
                            />
                          </Field>
                          <Field
                            label="Receipt date (optional)"
                            path="date"
                            error={receiptError("date")}
                          >
                            <input
                              type="date"
                              value={state.receipt.date}
                              onChange={(e) =>
                                editReceipt({ date: e.target.value })
                              }
                            />
                          </Field>
                          <Field
                            label="Currency"
                            path="currency"
                            error={
                              receiptError("currency") ||
                              (state.receipt.currencyUnresolved
                                ? "Choose the currency printed on your receipt."
                                : undefined)
                            }
                          >
                            <select
                              value={
                                state.receipt.currencyUnresolved
                                  ? ""
                                  : state.receipt.currency
                              }
                              onChange={(e) =>
                                editReceipt({
                                  currency: e.target
                                    .value as Receipt["currency"],
                                  currencyUnresolved: false,
                                })
                              }
                            >
                              <option value="" disabled>
                                Choose currency
                              </option>
                              {Object.keys(currencies).map((code) => (
                                <option key={code}>{code}</option>
                              ))}
                            </select>
                          </Field>
                          <MoneyInput
                            label="Printed total"
                            path="printedTotal"
                            error={
                              receiptError("printedTotal") ||
                              receiptError("total")
                            }
                            signed
                            value={state.receipt.printedTotal}
                            onChange={(printedTotal) =>
                              editReceipt({ printedTotal })
                            }
                          />
                          <MoneyInput
                            label="Subtotal after item discounts (optional)"
                            path="subtotal"
                            error={receiptError("subtotal")}
                            signed
                            value={state.receipt.subtotal}
                            onChange={(subtotal) => editReceipt({ subtotal })}
                          />
                          <MoneyInput
                            label="Printed tax (optional check)"
                            path="printedTax"
                            error={receiptError("printedTax")}
                            placeholder="Leave blank if not printed"
                            signed
                            value={state.receipt.printedTax}
                            onChange={(printedTax) =>
                              editReceipt({ printedTax })
                            }
                            hint="A check against the receipt. When prices exclude tax, add tax using codes or a tax adjustment below."
                          />
                        </div>
                        {(state.receipt.taxRegistrationNumber ||
                          state.receipt.printedTaxRate) && (
                          <aside
                            className="tax-registration"
                            aria-label="Printed tax details"
                          >
                            {state.receipt.taxRegistrationNumber && (
                              <p>
                                Tax registration:{" "}
                                <strong>
                                  {state.receipt.taxRegistrationNumber}
                                </strong>
                                . This identifies the business; it is not a tax
                                amount.
                              </p>
                            )}
                            {state.receipt.printedTaxRate && (
                              <p>
                                Printed tax rate:{" "}
                                <strong>{state.receipt.printedTaxRate}%</strong>
                                .
                              </p>
                            )}
                            {!state.receipt.printedTax && (
                              <p>
                                No separate tax amount was identified. Check the
                                receipt; leave Printed tax blank if no amount is
                                shown.
                              </p>
                            )}
                          </aside>
                        )}
                        <p className="hint">
                          Changing currency changes precision; it does not
                          convert prices.
                        </p>
                        <div className="tax-options">
                          <label
                            className="check-row"
                            data-validation-path="pricesIncludeTax"
                          >
                            <input
                              type="checkbox"
                              checked={state.receipt.pricesIncludeTax}
                              onChange={(e) =>
                                editReceipt({
                                  pricesIncludeTax: e.target.checked,
                                })
                              }
                            />
                            <span>
                              Item prices already include tax
                              <small>
                                Included tax is recorded for information. Extra
                                tax stays at zero.
                              </small>
                              {receiptError("pricesIncludeTax") && (
                                <small className="field-error" role="alert">
                                  {receiptError("pricesIncludeTax")}
                                </small>
                              )}
                            </span>
                          </label>
                          {!state.receipt.pricesIncludeTax && (
                            <Field
                              label="How should added tax be calculated?"
                              path="taxMode"
                              error={receiptError("taxMode")}
                            >
                              <select
                                value={state.receipt.taxMode}
                                onChange={(e) =>
                                  editReceipt({
                                    taxMode: e.target
                                      .value as Receipt["taxMode"],
                                  })
                                }
                              >
                                <option value="printed">
                                  Printed tax amount
                                </option>
                                <option value="codes">Item tax codes</option>
                              </select>
                            </Field>
                          )}
                          {!state.receipt.pricesIncludeTax &&
                            state.receipt.taxMode === "printed" &&
                            state.receipt.printedTax.trim() !== "" &&
                            !state.receipt.adjustments.some(
                              (adjustment) => adjustment.kind === "tax",
                            ) && (
                              <button
                                type="button"
                                className="text-button"
                                disabled={
                                  state.receipt.adjustments.length >= 30
                                }
                                onClick={() =>
                                  editReceipt({
                                    adjustments: [
                                      ...state.receipt.adjustments,
                                      {
                                        id: uid(),
                                        label: "Printed tax",
                                        kind: "tax",
                                        amount: state.receipt.printedTax,
                                        allocation: "proportional",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus size={16} />
                                Add printed tax
                              </button>
                            )}
                          {((!state.receipt.pricesIncludeTax &&
                            state.receipt.taxMode === "codes") ||
                            state.receipt.reviewChecks.some(
                              (check) =>
                                check.scope === "receipt" &&
                                check.field === "taxCodes",
                            )) && (
                            <div
                              className="tax-code-box"
                              data-validation-path="taxCodes"
                            >
                              {receiptError("taxCodes") && (
                                <p className="field-error" role="alert">
                                  {receiptError("taxCodes")}
                                </p>
                              )}
                              <p>
                                <strong>Use the legend on your receipt.</strong>{" "}
                                Match the printed code and rate. Codes vary by
                                retailer and country; keep an unreadable rate
                                blank until checked.
                              </p>
                              {state.receipt.taxCodes.map((code, index) => (
                                <div className="tax-code-row" key={index}>
                                  <Field
                                    label={`Tax code ${index + 1}`}
                                    path={`taxCodes.${index}.code`}
                                    error={receiptError(
                                      `taxCodes.${index}.code`,
                                    )}
                                  >
                                    <input
                                      value={code.code}
                                      maxLength={12}
                                      onChange={(e) =>
                                        editReceipt({
                                          taxCodes: state.receipt.taxCodes.map(
                                            (c, j) =>
                                              j === index
                                                ? {
                                                    ...c,
                                                    code: e.target.value.toUpperCase(),
                                                  }
                                                : c,
                                          ),
                                        })
                                      }
                                    />
                                  </Field>
                                  <MoneyInput
                                    label={`Rate % for code ${index + 1}`}
                                    path={`taxCodes.${index}.rate`}
                                    error={receiptError(
                                      `taxCodes.${index}.rate`,
                                    )}
                                    value={code.rate}
                                    onChange={(rate) =>
                                      editReceipt({
                                        taxCodes: state.receipt.taxCodes.map(
                                          (c, j) =>
                                            j === index ? { ...c, rate } : c,
                                        ),
                                      })
                                    }
                                  />
                                  <button
                                    className="icon-button danger"
                                    aria-label={`Remove tax code ${index + 1}`}
                                    onClick={() =>
                                      editReceipt({
                                        taxCodes: state.receipt.taxCodes.filter(
                                          (_, j) => j !== index,
                                        ),
                                      })
                                    }
                                  >
                                    <Trash2 size={17} />
                                  </button>
                                </div>
                              ))}
                              <button
                                className="text-button"
                                disabled={state.receipt.taxCodes.length >= 20}
                                onClick={() =>
                                  editReceipt({
                                    taxCodes: [
                                      ...state.receipt.taxCodes,
                                      { code: "", rate: "" },
                                    ],
                                  })
                                }
                              >
                                <Plus size={16} />
                                Add tax code
                              </button>
                            </div>
                          )}
                        </div>
                      </section>
                      <section className="panel items-panel">
                        <div className="panel-heading">
                          <h2>What’s in the trolley?</h2>
                          <span className="muted">
                            {state.receipt.items.length} purchase lines
                          </span>
                        </div>
                        <p className="hint">
                          Purchased packs and units inside each pack are
                          different. Pack sizes are confirmed later when sharing
                          by quantity.
                        </p>
                        {state.receipt.items.some((i) => !i.quantity) && (
                          <button
                            className="button button-outline"
                            onClick={() =>
                              setState((value) => ({
                                ...value,
                                receipt: value.receipt.items.reduce(
                                  (receipt, item) =>
                                    item.quantity
                                      ? receipt
                                      : applyItemEdit(receipt, item.id, {
                                          quantity: "1",
                                          note: "Purchased quantity set to one by you. Confirm against receipt.",
                                        }),
                                  value.receipt,
                                ),
                                finalizedStamp: "",
                              }))
                            }
                          >
                            Confirm all missing purchased quantities as 1
                          </button>
                        )}
                        <div className="item-table-heading">
                          <span>ITEM</span>
                          <span>LINE PRICE</span>
                          <span>AFTER TAX & DISCOUNTS</span>
                        </div>
                        {state.receipt.items.map((item, index) => (
                          <ItemEditor
                            key={item.id}
                            item={item}
                            index={index}
                            receipt={state.receipt}
                            issues={
                              validationAttempted === "review"
                                ? receiptResult.issues
                                : []
                            }
                            cost={receiptResult.items[index]?.total ?? 0n}
                            onChange={(change) => editItem(item.id, change)}
                            onDelete={() =>
                              editReceipt({
                                items: state.receipt.items.filter(
                                  (i) => i.id !== item.id,
                                ),
                              })
                            }
                          />
                        ))}
                        <button
                          className="text-button add-line"
                          data-validation-path="items"
                          disabled={state.receipt.items.length >= 300}
                          onClick={() =>
                            editReceipt({
                              items: [...state.receipt.items, newItem()],
                            })
                          }
                        >
                          <Plus size={18} />
                          Add an item
                        </button>
                      </section>
                      <section className="panel">
                        <div className="panel-heading">
                          <h2>Discounts & little extras</h2>
                        </div>
                        <p className="hint">
                          Purchase discounts reduce purchase costs before added
                          tax. Negative coupon reversals reduce refund credits.
                          An item discount belongs in that item’s details.
                          Shared charges on mixed purchases and returns need an
                          explicit choice: use equal per person, printed tax
                          codes or separate item charges.
                        </p>
                        {state.receipt.adjustments.map((a, index) => (
                          <div className="adjustment-row" key={a.id}>
                            <Field
                              label={`Adjustment ${index + 1} label`}
                              path={`adjustments.${a.id}.label`}
                              error={receiptError(`adjustments.${a.id}.label`)}
                            >
                              <input
                                value={a.label}
                                maxLength={100}
                                onChange={(e) =>
                                  editReceipt({
                                    adjustments: state.receipt.adjustments.map(
                                      (x) =>
                                        x.id === a.id
                                          ? { ...x, label: e.target.value }
                                          : x,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Field
                              label={`Adjustment ${index + 1} type`}
                              path={`adjustments.${a.id}.kind`}
                              error={receiptError(`adjustments.${a.id}.kind`)}
                            >
                              <select
                                value={a.kind}
                                onChange={(e) =>
                                  editReceipt({
                                    adjustments: state.receipt.adjustments.map(
                                      (x) =>
                                        x.id === a.id
                                          ? {
                                              ...x,
                                              kind: e.target
                                                .value as typeof a.kind,
                                              includedTaxRate:
                                                e.target.value === "fee"
                                                  ? x.includedTaxRate
                                                  : undefined,
                                            }
                                          : x,
                                    ),
                                  })
                                }
                              >
                                <option value="discount">
                                  Receipt discount
                                </option>
                                <option value="tax">Tax</option>
                                <option value="fee">Fee</option>
                                <option value="tip">Tip</option>
                                <option value="deposit">Deposit</option>
                                <option value="rounding">
                                  Rounding (signed)
                                </option>
                              </select>
                            </Field>
                            <MoneyInput
                              label={`Adjustment ${index + 1} amount`}
                              path={`adjustments.${a.id}`}
                              error={receiptError(`adjustments.${a.id}`)}
                              signed
                              value={a.amount}
                              onChange={(amount) =>
                                editReceipt({
                                  adjustments: state.receipt.adjustments.map(
                                    (x) =>
                                      x.id === a.id ? { ...x, amount } : x,
                                  ),
                                })
                              }
                            />
                            <Field
                              label={`Adjustment ${index + 1} allocation`}
                              path={`adjustments.${a.id}.allocation`}
                              error={receiptError(
                                `adjustments.${a.id}.allocation`,
                              )}
                            >
                              <select
                                disabled={a.kind === "discount"}
                                value={
                                  a.kind === "discount"
                                    ? "proportional"
                                    : a.allocation
                                }
                                onChange={(e) =>
                                  editReceipt({
                                    adjustments: state.receipt.adjustments.map(
                                      (x) =>
                                        x.id === a.id
                                          ? {
                                              ...x,
                                              allocation: e.target
                                                .value as typeof a.allocation,
                                            }
                                          : x,
                                    ),
                                  })
                                }
                              >
                                <option value="proportional">
                                  By item cost
                                </option>
                                <option value="equal-people">
                                  Equally per person
                                </option>
                              </select>
                            </Field>
                            {a.kind === "fee" && (
                              <div className="fee-tax-options">
                                <label className="check-row">
                                  <input
                                    type="checkbox"
                                    aria-label={`Adjustment ${index + 1}: fee already includes tax`}
                                    checked={a.includedTaxRate !== undefined}
                                    onChange={(e) =>
                                      editReceipt({
                                        adjustments:
                                          state.receipt.adjustments.map((x) =>
                                            x.id === a.id
                                              ? {
                                                  ...x,
                                                  includedTaxRate: e.target
                                                    .checked
                                                    ? ""
                                                    : undefined,
                                                }
                                              : x,
                                          ),
                                      })
                                    }
                                  />
                                  This fee already includes tax
                                </label>
                                {a.includedTaxRate !== undefined && (
                                  <>
                                    <Field
                                      label={`Adjustment ${index + 1} included tax rate (%)`}
                                      path={`adjustments.${a.id}.includedTaxRate`}
                                      hint="Use the fee’s printed rate and keep its full amount. A printed tax adjustment must be the full tax total, including this fee."
                                      error={
                                        receiptResult.issues.find(
                                          (issue) =>
                                            issue.path ===
                                            `adjustments.${a.id}.includedTaxRate`,
                                        )?.message
                                      }
                                    >
                                      <input
                                        inputMode="decimal"
                                        maxLength={40}
                                        value={a.includedTaxRate}
                                        onChange={(e) =>
                                          editReceipt({
                                            adjustments:
                                              state.receipt.adjustments.map(
                                                (x) =>
                                                  x.id === a.id
                                                    ? {
                                                        ...x,
                                                        includedTaxRate:
                                                          e.target.value,
                                                      }
                                                    : x,
                                              ),
                                          })
                                        }
                                      />
                                    </Field>
                                  </>
                                )}
                              </div>
                            )}
                            <button
                              className="icon-button danger"
                              aria-label={`Remove adjustment ${index + 1}`}
                              onClick={() =>
                                editReceipt({
                                  adjustments: state.receipt.adjustments.filter(
                                    (x) => x.id !== a.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={17} />
                            </button>
                            {a.kind === "tax" &&
                              state.receipt.pricesIncludeTax && (
                                <small className="included-tax">
                                  Already included in item prices. This row adds
                                  no extra tax.
                                </small>
                              )}
                          </div>
                        ))}
                        <button
                          className="text-button"
                          data-validation-path="adjustments"
                          disabled={state.receipt.adjustments.length >= 30}
                          onClick={() =>
                            editReceipt({
                              adjustments: [
                                ...state.receipt.adjustments,
                                {
                                  id: uid(),
                                  label: "",
                                  kind: "fee",
                                  amount: "",
                                  allocation: "proportional",
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={17} />
                          Add discount, tax or charge
                        </button>
                      </section>
                      {(state.receipt.rawText || rawText) && (
                        <details className="panel raw-text">
                          <summary>
                            Check or correct imported receipt text
                          </summary>
                          <Field label="Imported receipt text">
                            <textarea
                              rows={10}
                              maxLength={60000}
                              value={rawText || state.receipt.rawText}
                              onChange={(e) => {
                                setRawText(e.target.value);
                                editReceipt({ rawText: e.target.value });
                              }}
                            />
                          </Field>
                          <button
                            className="button button-outline"
                            onClick={parseText}
                          >
                            Reparse text (replaces current items)
                          </button>
                          <p className="hint">
                            Imported text clears when you refresh. The receipt
                            fields above remain editable.
                          </p>
                        </details>
                      )}
                      <ReviewChecks
                        receipt={state.receipt}
                        checks={state.receipt.reviewChecks.filter(
                          (check) => check.scope === "receipt",
                        )}
                      />
                      <h3>Calculation details</h3>
                      <SummaryRows
                        receipt={state.receipt}
                        result={receiptResult}
                      />
                    </details>
                    <IssueBox
                      issues={receiptResult.issues.map((i) => i.message)}
                      title="Let’s get the receipt to balance"
                    />
                    <div className="screen-actions">
                      <button
                        className="text-button"
                        onClick={() => navigate("scan")}
                      >
                        <ArrowLeft size={16} />
                        Back to receipt
                      </button>
                      <button
                        className="button button-primary"
                        data-validation-path="review"
                        onClick={continueReview}
                      >
                        Confirm receipt & add people
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </>
                )}
                {state.step === "people" && (
                  <section className="panel people-panel">
                    <div className="people-icon">
                      <Users size={30} strokeWidth={1.5} />
                    </div>
                    <h2>Good things are better shared.</h2>
                    <p className="muted">
                      Names stay on this device. No invites or accounts needed.
                    </p>
                    <form onSubmit={addPerson} className="add-person">
                      <Field
                        label="Person’s name"
                        path="people"
                        error={
                          validationAttempted === "people" &&
                          !state.people.length
                            ? peopleIssues[0]?.message
                            : undefined
                        }
                      >
                        <input
                          maxLength={50}
                          autoComplete="off"
                          placeholder="e.g. Alice"
                          value={personName}
                          onChange={(e) => setPersonName(e.target.value)}
                        />
                      </Field>
                      <button
                        type="submit"
                        className="button button-primary"
                        disabled={
                          !personName.trim() || state.people.length >= 30
                        }
                      >
                        <Plus size={18} />
                        Add person
                      </button>
                    </form>
                    {!state.people.length && (
                      <div className="empty-people">
                        <span className="avatar sage">A</span>
                        <span className="avatar peach">B</span>
                        <span className="avatar blue">C</span>
                        <p>Room for everyone. Start with a name.</p>
                      </div>
                    )}
                    <div className="people-list">
                      {state.people.map((person, i) => (
                        <div className="person-row" key={person.id}>
                          <Avatar name={person.name} index={i} />
                          <Field
                            label={`Person ${i + 1} name`}
                            path={`people.${i}.name`}
                            error={
                              validationAttempted === "people"
                                ? peopleIssues.find(
                                    (issue) =>
                                      issue.path === `people.${i}.name`,
                                  )?.message
                                : undefined
                            }
                          >
                            <input
                              maxLength={50}
                              value={person.name}
                              onChange={(e) =>
                                setState((s) => ({
                                  ...s,
                                  people: s.people.map((p) =>
                                    p.id === person.id
                                      ? { ...p, name: e.target.value }
                                      : p,
                                  ),
                                  finalizedStamp: "",
                                }))
                              }
                            />
                          </Field>
                          <button
                            className="icon-button danger"
                            aria-label={`Remove person ${i + 1}`}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove ${person.name}? Their assignments will be cleared and the remaining shares recalculated.`,
                                )
                              )
                                setState((s) => removePerson(s, person.id));
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="hint">
                      Same name? No problem. Person numbers keep everyone’s
                      shares separate.
                    </p>
                    <div className="screen-actions">
                      <button
                        className="text-button"
                        onClick={() => navigate("review")}
                      >
                        <ArrowLeft size={16} />
                        Review receipt
                      </button>
                      <button
                        className="button button-primary"
                        onClick={() =>
                          peopleIssues.length
                            ? showValidation(peopleIssues, "people")
                            : navigate("assign")
                        }
                      >
                        Let’s share it
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </section>
                )}
                {state.step === "assign" && (
                  <>
                    <div className="sharing-toolbar">
                      <div className="segmented" aria-label="Split scope">
                        <button
                          aria-pressed={state.splitMode === "items"}
                          onClick={() =>
                            setState((s) => ({
                              ...s,
                              splitMode: "items",
                              finalizedStamp: "",
                            }))
                          }
                        >
                          By item
                        </button>
                        <button
                          aria-pressed={state.splitMode === "whole"}
                          onClick={() =>
                            setState((s) => ({
                              ...s,
                              splitMode: "whole",
                              finalizedStamp: "",
                            }))
                          }
                        >
                          Whole receipt
                        </button>
                      </div>
                      {state.splitMode === "items" && (
                        <button
                          className="text-button"
                          disabled={!state.people.length}
                          onClick={() =>
                            setState((s) => ({
                              ...s,
                              receipt: {
                                ...s.receipt,
                                items: s.receipt.items.map((item) => ({
                                  ...item,
                                  assignment: {
                                    mode: "equal",
                                    participants: s.people.map((p) => p.id),
                                    values: {},
                                  },
                                })),
                              },
                              finalizedStamp: "",
                            }))
                          }
                        >
                          <Users size={16} />
                          Share all equally
                        </button>
                      )}
                    </div>
                    <div className="assignment-progress">
                      <span>
                        {assigned} of {assignmentCount} fully assigned
                      </span>
                      <progress
                        aria-label="Assignment progress"
                        value={assigned}
                        max={assignmentCount || 1}
                      />
                      <span>
                        {assignmentCount && assigned === assignmentCount
                          ? "Lovely. Everything has a share."
                          : "Every item needs a home."}
                      </span>
                    </div>
                    {!state.people.length && (
                      <div className="review-notes">
                        <p>Add people before assigning the shop.</p>
                        <button
                          className="button button-outline"
                          onClick={() => navigate("people")}
                        >
                          Add people
                        </button>
                      </div>
                    )}
                    {state.splitMode === "whole" ? (
                      <section
                        className="panel assignment-card"
                        data-testid="whole-assignment"
                      >
                        <div className="assignment-heading">
                          <span className="icon-disc">
                            <ReceiptText size={20} />
                          </span>
                          <div>
                            <h2>The whole shop</h2>
                            <p>
                              One share per person, including all discounts, tax
                              and extras.
                            </p>
                          </div>
                          <strong>{f(receiptResult.total)}</strong>
                        </div>
                        <AssignmentControls
                          assignment={state.wholeAssignment}
                          state={state}
                          onChange={(wholeAssignment) =>
                            setState((s) => ({
                              ...s,
                              wholeAssignment,
                              finalizedStamp: "",
                            }))
                          }
                        />
                      </section>
                    ) : (
                      state.receipt.items.map((item, i) => (
                        <section
                          className={`panel assignment-card ${result.statuses.get(item.id)?.status === "complete" ? "complete" : ""}`}
                          key={item.id}
                          data-testid={`assignment-item-${i}`}
                        >
                          <div className="assignment-heading">
                            <span className="item-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <h2>{item.description || "Unnamed item"}</h2>
                              <p>
                                {item.quantity || "?"} purchased{" "}
                                {item.quantity === "1"
                                  ? "pack / unit"
                                  : "packs / units"}
                                {item.discount && item.discount !== "0"
                                  ? " · item discount applied"
                                  : ""}
                                {!state.receipt.pricesIncludeTax
                                  ? ` · tax code ${item.taxCode || "not set"}`
                                  : " · tax included"}
                              </p>
                            </div>
                            <strong>
                              {f(receiptResult.items[i]?.total || 0n)}
                            </strong>
                          </div>
                          <AssignmentControls
                            assignment={item.assignment}
                            item={item}
                            state={state}
                            onChange={(assignment) =>
                              editItem(item.id, { assignment })
                            }
                            onItemChange={(change) => editItem(item.id, change)}
                          />
                          <details className="cost-explainer">
                            <summary>
                              How this item’s cost is calculated
                            </summary>
                            <SummaryItemCost
                              receipt={state.receipt}
                              cost={receiptResult.items[i]}
                            />
                            <p>
                              Receipt-wide discounts reduce the base before
                              added tax. Remainder pennies follow receipt order.
                              Proportional extras travel with the item.
                            </p>
                          </details>
                        </section>
                      ))
                    )}
                    <IssueBox
                      issues={result.issues
                        .filter((i) => !i.path.startsWith("assignment."))
                        .map((i) => i.message)}
                      title="A few details still need attention"
                    />
                    <div className="screen-actions">
                      <button
                        className="text-button"
                        onClick={() => navigate("people")}
                      >
                        <ArrowLeft size={16} />
                        Edit people
                      </button>
                      <button
                        className="button button-primary"
                        onClick={finalize}
                      >
                        Finalize split
                        <CheckCheck size={18} />
                      </button>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("summary")}
                    >
                      View draft breakdown
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {state.step === "summary" && (
                  <>
                    <div
                      className={`completion-banner ${finalized ? "" : "draft"}`}
                    >
                      <span className="completion-icon">
                        {finalized ? (
                          <CheckCheck size={25} />
                        ) : (
                          <FileText size={25} />
                        )}
                      </span>
                      <div>
                        <h2>
                          {finalized
                            ? "All balanced. All accounted for."
                            : "A work in progress."}
                        </h2>
                        <p>
                          {finalized
                            ? `${f(result.assignedTotal)} shared across ${state.people.length} ${state.people.length === 1 ? "person" : "people"}.`
                            : "These amounts are a draft. Check unresolved details before sharing as final."}
                        </p>
                      </div>
                    </div>
                    {!finalized && (
                      <>
                        <IssueBox
                          issues={result.issues.map((i) => i.message)}
                          title="Before you finalize"
                        />
                        {result.canFinalize && (
                          <button
                            className="button button-primary"
                            onClick={finalize}
                          >
                            Finalize checked split
                            <CheckCheck size={17} />
                          </button>
                        )}
                      </>
                    )}
                    <div className="person-breakdowns">
                      {result.totals.map((entry, i) => (
                        <details
                          className="panel person-breakdown"
                          key={entry.person.id}
                          open={state.people.length === 1}
                        >
                          <summary>
                            <Avatar name={entry.person.name} index={i} />
                            <span className="person-heading">
                              <strong>{entry.person.name}</strong>
                              <small>
                                {entry.total < 0n && "Credit share · "}
                                Person {i + 1} · {entry.lines.length} allocated{" "}
                                {entry.lines.length === 1 ? "line" : "lines"}
                              </small>
                            </span>
                            <strong
                              className="person-amount"
                              data-testid={`person-total-${i}`}
                            >
                              {f(entry.total)}
                            </strong>
                            <ChevronDown size={19} />
                          </summary>
                          <div className="breakdown-lines">
                            {entry.lines.map((line, j) => (
                              <div key={j}>
                                <div className="breakdown-line">
                                  <span>
                                    <strong>{line.label}</strong>
                                    <small>{line.detail}</small>
                                  </span>
                                  <strong>{f(line.amount)}</strong>
                                </div>
                                <p className="hint">
                                  Base after discounts {f(line.net)} · added tax{" "}
                                  {f(line.tax)} · other adjustments{" "}
                                  {f(line.charges)}
                                  {line.rounding !== 0n && (
                                    <>
                                      {" "}
                                      · allocation rounding {f(line.rounding)}
                                    </>
                                  )}
                                </p>
                              </div>
                            ))}
                            {!entry.lines.length && (
                              <p className="hint">
                                No costs assigned to this person yet.
                              </p>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                    <section className="panel share-panel">
                      <span className="icon-disc">
                        <Heart size={21} />
                      </span>
                      <h2>Good to go. Good to share.</h2>
                      <p>
                        Send the breakdown to your group chat, or save a copy
                        for later.
                      </p>
                      <div className="share-actions">
                        <button
                          className="button button-primary"
                          onClick={() => void copySummary()}
                        >
                          <Copy size={17} />
                          Copy {finalized ? "summary" : "draft"}
                        </button>
                        <button
                          className="button button-outline"
                          onClick={downloadSummary}
                        >
                          <Download size={17} />
                          Download summary
                        </button>
                      </div>
                      <details className="rounding-explainer">
                        <summary>How we handle shares and rounding</summary>
                        <p>
                          Amounts use exact currency minor units. Each item's
                          final cost (or the whole receipt) is divided by its
                          shares; leftover pennies go to the largest fractional
                          remainders. Component rounding differences are shown
                          as allocation rounding and net to zero across people.
                          Ties follow receipt item order, then the order people
                          were added. Tax-code totals are rounded once per code
                          and allocated back to items.
                        </p>
                        <p>
                          Purchase discounts apply proportionally to purchases;
                          negative coupon reversals apply to returns. Shared
                          charges on mixed purchases and returns need an
                          explicit allocation. Equal-per-person charges are
                          shared by everyone. Whole-receipt mode applies the
                          whole-receipt shares to every component.
                        </p>
                        <p>
                          Physical quantities must match purchased packs ×
                          confirmed units per pack. Ratios describe cost shares.
                          Percentages must total 100%.
                        </p>
                        <p>
                          Negative shares are refund credits. No original payer
                          or reimbursement direction has been assumed.
                        </p>
                      </details>
                    </section>
                    <div className="screen-actions">
                      <button
                        className="text-button"
                        onClick={() => navigate("assign")}
                      >
                        <ArrowLeft size={16} />
                        Adjust shares
                      </button>
                      <button
                        className="text-button"
                        onClick={() => navigate("review")}
                      >
                        Edit receipt
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              {state.step !== "review" && sidePanel}
            </div>
          </>
        )}
        <footer className="site-footer">
          <span>
            <Leaf size={15} />
            Made for the things we share.
          </span>
          <span>
            {saveError ? "Draft not saved" : "Draft saved on this device"}
          </span>
          <button className="text-button" disabled={busy} onClick={reset}>
            <RotateCcw size={14} />
            Delete / reset receipt
          </button>
        </footer>
      </main>
      <dialog
        ref={dialogRef}
        onCancel={() => {
          setCropTarget(null);
          setPrivacy(false);
          setZoomImage(null);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            setCropTarget(null);
            setPrivacy(false);
            setZoomImage(null);
          }
        }}
        aria-label={
          cropTarget
            ? "Crop receipt image"
            : zoomImage
              ? zoomImage.geometry
                ? "Original and corrected receipt"
                : "Original receipt image"
              : "Your privacy at Gather"
        }
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close dialog"
          onClick={() => {
            setCropTarget(null);
            setPrivacy(false);
            setZoomImage(null);
          }}
        >
          <X size={20} />
        </button>
        {cropTarget ? (
          <ImageCropper
            key={cropTarget.id}
            image={cropTarget}
            onCancel={() => setCropTarget(null)}
            onApply={(cropped) => {
              const next = images.map((image) =>
                image.id === cropped.id ? cropped : image,
              );
              if (
                next.reduce(
                  (count, image) => count + readingBlobs(image).length,
                  0,
                ) > MAX_READING_PANELS
              ) {
                setImageError(
                  "This correction creates more than 24 detail sections. Use fewer photos or trim the receipt first.",
                );
                setCropTarget(null);
                return;
              }
              setImages(next);
              setAiConsented(false);
              setCropTarget(null);
            }}
          />
        ) : zoomImage ? (
          <>
            {images.length > 1 && (
              <nav
                className="receipt-photo-navigation"
                aria-label="Receipt photos"
              >
                {images.map((image, index) => (
                  <button
                    className="button button-outline"
                    key={image.id}
                    aria-pressed={image.id === zoomImage.id}
                    onClick={() => setZoomImage(image)}
                  >
                    Photo {index + 1}
                  </button>
                ))}
              </nav>
            )}
            <ReceiptPhotos key={zoomImage.id} image={zoomImage} />
          </>
        ) : (
          <div className="privacy-dialog">
            <ShieldCheck size={32} />
            <h2>Receipt privacy</h2>
            <p>
              When you approve a scan, Gather sends the selected photos or
              rendered PDF pages to OpenAI. The scan can use API credits. The
              key stays on the server. OpenAI handles submitted images under its{" "}
              <a
                href="https://developers.openai.com/api/docs/guides/your-data"
                target="_blank"
                rel="noreferrer"
              >
                API data policy
              </a>
              .
            </p>
            <p>
              Your extracted draft and names are saved in this browser’s local
              storage so you can continue after a refresh. People with access to
              this browser profile can read them. Photos and imported text are
              only kept in memory and disappear on refresh or when the tab
              closes.
            </p>
            <p>
              Delete / reset receipt removes this app’s saved draft and current
              image previews. Exported or copied summaries remain wherever you
              save or send them. The server keeps scan allowance records. The
              browser keeps your draft and the names you enter.
            </p>
            <p>
              Camera availability depends on your browser. A phone accessing the
              app over a network normally needs HTTPS for camera and clipboard
              features.
            </p>
            <button
              className="button button-primary"
              onClick={() => setPrivacy(false)}
            >
              Sounds good
              <Check size={17} />
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}

function SummaryRows({
  receipt,
  result,
}: {
  receipt: Receipt;
  result: ReceiptResult;
}) {
  const f = (n: bigint) => formatReceiptMoney(n, receipt);
  return (
    <dl className="summary-rows">
      <div>
        <dt>Items after item discounts</dt>
        <dd>{f(result.subtotal)}</dd>
      </div>
      {result.receiptDiscount !== 0n && (
        <div>
          <dt>Receipt discounts</dt>
          <dd>{f(-result.receiptDiscount)}</dd>
        </div>
      )}
      {(result.tax !== 0n ||
        receipt.printedTax ||
        receipt.adjustments.some((row) => row.kind === "tax") ||
        receipt.taxCodes.length > 0) && (
        <div>
          <dt>{receipt.pricesIncludeTax ? "Additional tax" : "Added tax"}</dt>
          <dd>{f(result.tax)}</dd>
        </div>
      )}
      {result.otherCharges !== 0n && (
        <div>
          <dt>Fees, tips & adjustments</dt>
          <dd>{f(result.otherCharges)}</dd>
        </div>
      )}
      {result.includedFeeTax !== undefined && (
        <div>
          <dt>Tax already in fees (included above)</dt>
          <dd>{f(result.includedFeeTax)}</dd>
        </div>
      )}
      <div>
        <dt>Calculated total</dt>
        <dd>{f(result.total)}</dd>
      </div>
      {result.discrepancy !== null && result.discrepancy !== 0n && (
        <div className="error-text">
          <dt>Difference from printed total</dt>
          <dd>{f(result.discrepancy)}</dd>
        </div>
      )}
    </dl>
  );
}
function SummaryItemCost({
  receipt,
  cost,
}: {
  receipt: Receipt;
  cost?: ReceiptResult["items"][number];
}) {
  if (!cost) return null;
  const f = (n: bigint) => formatReceiptMoney(n, receipt);
  return (
    <dl className="summary-rows">
      <div>
        <dt>Item after its own discount</dt>
        <dd>{f(cost.net)}</dd>
      </div>
      <div>
        <dt>Allocated receipt discount</dt>
        <dd>{f(-cost.receiptDiscount)}</dd>
      </div>
      <div>
        <dt>Allocated added tax</dt>
        <dd>{f(cost.tax)}</dd>
      </div>
      <div>
        <dt>Allocated other charges</dt>
        <dd>{f(cost.charges)}</dd>
      </div>
      <div>
        <dt>Item total</dt>
        <dd>{f(cost.total)}</dd>
      </div>
    </dl>
  );
}
function ItemEditor({
  item,
  index,
  receipt,
  cost,
  onChange,
  onDelete,
  issues,
}: {
  item: Item;
  index: number;
  receipt: Receipt;
  cost: bigint;
  onChange: (change: Partial<Item>) => void;
  onDelete: () => void;
  issues: Issue[];
}) {
  const checks = receipt.reviewChecks.filter(
    (check) => check.scope === "item" && check.itemId === item.id,
  );
  const fieldError = (field: string) => {
    const invalid = issues.find(
      (issue) => issue.path === `items.${index}.${field}`,
    );
    return invalid?.message;
  };
  const [expanded, setExpanded] = useState(
    !item.description ||
      !item.quantity ||
      !item.lineTotal ||
      checks.some((check) => checkIsPending(receipt, check)),
  );
  return (
    <div
      className="item-editor"
      data-testid={`review-item-${index}`}
      data-validation-item={index}
    >
      <div className="item-editor-top">
        <div
          className="item-name-input"
          data-validation-path={`items.${index}.description`}
        >
          <span className="item-number">{index + 1}</span>
          <label className="visually-hidden" htmlFor={`description-${item.id}`}>
            Item {index + 1} description
          </label>
          <input
            id={`description-${item.id}`}
            value={item.description}
            maxLength={180}
            placeholder="Item description"
            aria-invalid={Boolean(fieldError("description"))}
            aria-describedby={
              fieldError("description")
                ? `description-error-${item.id}`
                : undefined
            }
            onChange={(e) => onChange({ description: e.target.value })}
          />
          {fieldError("description") && (
            <small
              id={`description-error-${item.id}`}
              className="field-error"
              role="alert"
            >
              {fieldError("description")}
            </small>
          )}
        </div>
        <MoneyInput
          label={`Item ${index + 1} line price`}
          path={`items.${index}.lineTotal`}
          value={item.lineTotal}
          error={fieldError("lineTotal")}
          onChange={(lineTotal) => onChange({ lineTotal })}
        />
        <strong className="item-cost">
          {formatReceiptMoney(cost, receipt)}
        </strong>
        <button
          className="icon-button"
          aria-label={`${expanded ? "Hide" : "Edit"} details for item ${index + 1}`}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown className={expanded ? "rotated" : ""} size={18} />
        </button>
      </div>
      <div className="item-quantity-row">
        <MoneyInput
          label={`Item ${index + 1} purchased quantity`}
          displayLabel="Purchased qty"
          path={`items.${index}.quantity`}
          value={item.quantity}
          placeholder="Check count"
          error={fieldError("quantity")}
          onChange={(quantity) => onChange({ quantity })}
        />
        {item.unitPrice && (
          <p className="hint">
            {item.quantity || "?"} × {item.unitPrice}{" "}
            {receipt.currencyUnresolved ? "" : receipt.currency} each
            {item.unitPriceDerived ? " · calculated" : ""}
          </p>
        )}
      </div>
      {item.note && (
        <p className="item-note">
          <CircleHelp size={14} />
          {item.note}
        </p>
      )}
      {expanded && (
        <div className="item-detail-fields">
          <div className="form-grid">
            <MoneyInput
              label={`Item ${index + 1} unit price (optional)`}
              path={`items.${index}.unitPrice`}
              value={item.unitPrice}
              error={fieldError("unitPrice")}
              onChange={(unitPrice) => onChange({ unitPrice })}
            />
            <MoneyInput
              label={`Item ${index + 1} discount`}
              path={`items.${index}.discount`}
              value={item.discount}
              error={fieldError("discount")}
              onChange={(discount) => onChange({ discount })}
            />
            {!receipt.pricesIncludeTax && receipt.taxMode === "codes" && (
              <Field
                label={`Item ${index + 1} tax code`}
                path={`items.${index}.taxCode`}
                error={fieldError("taxCode")}
              >
                <select
                  value={item.taxCode}
                  onChange={(e) => onChange({ taxCode: e.target.value })}
                >
                  <option value="">Choose code</option>
                  {!receipt.taxCodes.some((c) => c.code === item.taxCode) &&
                    item.taxCode && (
                      <option value={item.taxCode}>
                        {item.taxCode} (define rate above)
                      </option>
                    )}
                  {receipt.taxCodes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.rate || "?"}%
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <p className="hint">
            Line price is the full purchased quantity before its separate
            discount. For example, two packs at £3.99 have a £7.98 line price.
          </p>
          <RefundControl
            item={item}
            index={index}
            receipt={receipt}
            onChange={onChange}
          />
          <button className="text-button danger" onClick={onDelete}>
            <Trash2 size={15} />
            Remove this purchase line
          </button>
        </div>
      )}
      {item.observedUnitPrice && (
        <p className="hint">
          First unit reading: {item.observedUnitPrice}. Current unit price:{" "}
          {item.unitPrice}
          {item.unitPriceDerived
            ? ", calculated from quantity and line amount"
            : ""}
          .
        </p>
      )}
      {item.observedDescription && (
        <p className="hint">
          First name reading: {item.observedDescription}. Current name:{" "}
          {item.description}.
        </p>
      )}
      <ReviewChecks receipt={receipt} checks={checks} />
    </div>
  );
}
function AssignmentControls({
  assignment,
  item,
  state,
  onChange,
  onItemChange,
}: {
  assignment: Assignment;
  item?: Item;
  state: AppState;
  onChange: (assignment: Assignment) => void;
  onItemChange?: (change: Partial<Item>) => void;
}) {
  const status = assignmentWeights(assignment, state.people, item);
  const errorId = useId();
  const invalidPerson =
    assignment.mode === "equal"
      ? undefined
      : assignment.participants.find((id) => {
          try {
            const value = weight(assignment.values[id] || "");
            return (
              value <= 0n ||
              (assignment.mode === "quantity" &&
                item?.unitKind === "whole" &&
                value % SCALE !== 0n)
            );
          } catch {
            return true;
          }
        });
  let invalidPack = false;
  if (
    assignment.mode === "quantity" &&
    item &&
    assignment.participants.length &&
    !invalidPerson
  ) {
    try {
      const pack = weight(item.packSize);
      invalidPack =
        pack <= 0n || (item.unitKind === "whole" && pack % SCALE !== 0n);
    } catch {
      invalidPack = true;
    }
  }
  function toggle(id: string) {
    const selected = assignment.participants.includes(id);
    onChange({
      ...assignment,
      participants: selected
        ? assignment.participants.filter((p) => p !== id)
        : [...assignment.participants, id],
      values: selected
        ? assignment.values
        : {
            ...assignment.values,
            [id]:
              assignment.values[id] || (assignment.mode === "ratio" ? "1" : ""),
          },
    });
  }
  return (
    <div
      className="assignment-controls"
      data-validation-path={item ? `assignment.${item.id}` : "whole"}
    >
      <div className="assignment-method">
        <Field label="Split method">
          <select
            value={assignment.mode}
            onChange={(e) =>
              onChange({
                ...assignment,
                mode: e.target.value as Assignment["mode"],
                values: {},
              })
            }
          >
            <option value="equal">Equal shares</option>
            {item && <option value="quantity">Physical quantities</option>}
            <option value="ratio">Custom ratio</option>
            <option value="percent">Percentages</option>
          </select>
        </Field>
        <span className={`assignment-status ${status.status}`}>
          <span>
            {status.status === "complete" ? (
              <Check size={14} />
            ) : (
              <CircleHelp size={14} />
            )}
          </span>
          {status.status === "complete"
            ? "Fully assigned"
            : status.status === "unassigned"
              ? "Unassigned"
              : "Partially assigned"}
        </span>
      </div>
      {assignment.mode === "quantity" && item && (
        <div className="quantity-setup">
          <MoneyInput
            label="Units per purchased pack"
            value={item.packSize}
            error={invalidPack ? status.issue : undefined}
            onChange={(packSize) => onItemChange?.({ packSize })}
            hint={`${item.quantity || "?"} purchased packs × units per pack = available units. Confirm the pack size yourself.`}
          />
          <Field label="Kind of units">
            <select
              value={item.unitKind}
              onChange={(e) =>
                onItemChange?.({ unitKind: e.target.value as Item["unitKind"] })
              }
            >
              <option value="whole">Whole units (cans, eggs…)</option>
              <option value="measured">Measured goods (kg, litres…)</option>
            </select>
          </Field>
        </div>
      )}
      {assignment.mode === "ratio" && (
        <p className="mode-hint">
          Ratios divide cost. A ratio of 1:3:5 gives nine cost shares; it does
          not mean nine physical units.
        </p>
      )}
      {assignment.mode === "percent" && (
        <p className="mode-hint">
          Enter each person’s percentage. Together they must add up to exactly
          100%.
        </p>
      )}
      {assignment.mode === "equal" && (
        <p className="mode-hint">
          Tick everyone sharing this cost. One person selected? They pay the
          full amount.
        </p>
      )}
      <div className="person-toggles">
        {state.people.map((person, i) => (
          <label
            key={person.id}
            className={`person-toggle ${assignment.participants.includes(person.id) ? "selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={assignment.participants.includes(person.id)}
              aria-invalid={status.status === "unassigned"}
              aria-describedby={
                status.status === "unassigned" ? errorId : undefined
              }
              onChange={() => toggle(person.id)}
              aria-label={displayName(person.name, i)}
            />
            <Avatar name={person.name} index={i} small />
            <span>
              {person.name}
              <small>Person {i + 1}</small>
            </span>
          </label>
        ))}
      </div>
      {assignment.mode !== "equal" && (
        <div className="share-values">
          {state.people.map(
            (person, i) =>
              assignment.participants.includes(person.id) && (
                <MoneyInput
                  key={person.id}
                  label={`${assignment.mode === "quantity" ? "Units" : assignment.mode === "percent" ? "Percent" : "Weight"} for ${displayName(person.name, i)}`}
                  value={assignment.values[person.id] || ""}
                  error={
                    invalidPack ||
                    (invalidPerson && invalidPerson !== person.id)
                      ? undefined
                      : status.issue
                  }
                  onChange={(value) =>
                    onChange({
                      ...assignment,
                      values: { ...assignment.values, [person.id]: value },
                    })
                  }
                />
              ),
          )}
        </div>
      )}
      {status.issue && (
        <p className="allocation-error" role="status" id={errorId}>
          {status.issue}
        </p>
      )}
    </div>
  );
}
function IssueBox({ issues, title }: { issues: string[]; title: string }) {
  if (!issues.length) return null;
  const unique = [...new Set(issues)];
  return (
    <div className="issue-box" role="status">
      <h3>
        <AlertCircle size={18} />
        {title}
      </h3>
      <ul>
        {unique.slice(0, 5).map((issue, i) => (
          <li key={i}>{issue}</li>
        ))}
      </ul>
      {unique.length > 5 && (
        <details>
          <summary>{unique.length - 5} more checks</summary>
          <ul>
            {unique.slice(5).map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
