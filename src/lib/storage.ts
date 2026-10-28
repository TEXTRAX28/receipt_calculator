import { appSchema, newState, receiptStamp, type AppState } from "./model";
export const STORAGE_KEY = "gather.receipt.v1";
export function loadDraft(storage: Pick<Storage, "getItem">): {
  state: AppState;
  warning: string;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { state: newState(), warning: "" };
    if (raw.length > 800000)
      throw new Error("Stored draft exceeds the safety limit.");
    const state = appSchema.parse(JSON.parse(raw));
    // Receipt images and raw OCR are intentionally not persisted.
    return { state, warning: "" };
  } catch {
    return {
      state: newState(),
      warning:
        "The saved draft could not be read safely. Start a new receipt; the unreadable draft has not been imported.",
    };
  }
}
export function saveDraft(
  storage: Pick<Storage, "setItem">,
  state: AppState,
): void {
  const safe = appSchema.parse(state);
  const persisted = { ...safe, receipt: { ...safe.receipt, rawText: "" } };
  // Review fingerprints ignore OCR text, so refreshing never undoes a valid financial review.
  if (safe.reviewedStamp === receiptStamp(safe.receipt))
    persisted.reviewedStamp = receiptStamp(persisted.receipt);
  persisted.finalizedStamp = ""; // A refreshed draft is rechecked before it can be finalized again.
  const text = JSON.stringify(persisted);
  if (text.length > 800000)
    throw new Error("Draft is too large to save locally.");
  storage.setItem(STORAGE_KEY, text);
}
