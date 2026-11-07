import type { Receipt } from "./model";
import type { Issue } from "./engine";
import { pendingReviewIssues } from "./review-checks";
import { money } from "./money";

export type ValidationIssue = Issue & { review: boolean };

/** Correct invalid inputs first, then source confirmations; follow form order in each group. */
export function firstReceiptIssue(
  receipt: Receipt,
  issues: Issue[],
): ValidationIssue | undefined {
  const paths = [
    "merchant",
    "date",
    "currency",
    "printedTotal",
    "subtotal",
    "printedTax",
    "pricesIncludeTax",
    "taxMode",
    "taxCodes",
    ...receipt.taxCodes.flatMap((_, index) => [
      `taxCodes.${index}.code`,
      `taxCodes.${index}.rate`,
    ]),
    ...receipt.items.flatMap((_, index) =>
      [
        "description",
        "lineTotal",
        "quantity",
        "unitPrice",
        "discount",
        "taxCode",
      ].map((field) => `items.${index}.${field}`),
    ),
    ...receipt.adjustments.flatMap((row) => [
      `adjustments.${row.id}.label`,
      `adjustments.${row.id}.kind`,
      `adjustments.${row.id}`,
      `adjustments.${row.id}.allocation`,
      `adjustments.${row.id}.includedTaxRate`,
    ]),
    "items",
    "adjustments",
    "review",
  ];
  const pending = pendingReviewIssues(receipt);
  const selected = issues
    .map((issue, index) => {
      const review = pending.some(
        (entry) => entry.path === issue.path && entry.message === issue.message,
      );
      let path = issue.path === "total" ? "printedTotal" : issue.path;
      if (!review && path === "adjustments" && receipt.adjustments.length) {
        const row =
          receipt.adjustments.find((entry) => entry.kind === "discount") ||
          receipt.adjustments[0];
        path = `adjustments.${row.id}`;
      }
      if (!review) {
        const row = receipt.adjustments.find(
          (entry) =>
            path === `adjustments.${entry.id}.includedTaxRate` &&
            entry.kind !== "fee",
        );
        if (row) path = `adjustments.${row.id}.kind`;
      }
      const item = path.match(/^items\.([^\.]+)$/);
      if (item && !/^\d+$/.test(item[1])) {
        const at = receipt.items.findIndex((row) => row.id === item[1]);
        if (at >= 0) path = `items.${at}.lineTotal`;
      }
      const order = paths.indexOf(path);
      // A missing price can create several downstream mismatches. Correct the
      // input before asking the user to change an otherwise valid printed total.
      let reconciliation = issue.path === "total";
      if (
        issue.path === "printedTotal" ||
        issue.path === "subtotal" ||
        issue.path === "printedTax"
      ) {
        try {
          money(receipt[issue.path], receipt.currency, true);
          reconciliation = true;
        } catch {
          /* A malformed literal is an input error. */
        }
      }
      return {
        ...issue,
        path,
        review,
        index,
        reconciliation,
        order: order < 0 ? paths.length : order,
      };
    })
    .sort(
      (a, b) =>
        Number(a.review) - Number(b.review) ||
        Number(a.reconciliation) - Number(b.reconciliation) ||
        a.order - b.order ||
        a.index - b.index,
    )[0];
  return selected
    ? {
        path: selected.path,
        message: selected.message,
        review: selected.review,
      }
    : undefined;
}

const controls =
  "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

/** Called inside React flushSync so a collapsed item's input exists before focus. */
export function openValidationDetails(document: Document, path: string) {
  const item = path.match(/^items\.(\d+)\.(?:unitPrice|discount|taxCode)$/);
  if (item) {
    const row = Array.from(
      document.querySelectorAll<HTMLElement>("[data-validation-item]"),
    ).find((element) => element.dataset.validationItem === item[1]);
    const toggle = row?.querySelector<HTMLButtonElement>(
      'button[aria-expanded="false"]',
    );
    toggle?.click();
  }
}

/** Keep focus in the original click gesture for mobile keyboards; never disable zoom. */
export function focusValidationIssue(
  document: Document,
  issue: ValidationIssue,
): boolean {
  const attribute = issue.review ? "data-review-path" : "data-validation-path";
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>(`[${attribute}]`),
  ).filter((element) => element.getAttribute(attribute) === issue.path);
  const target =
    matches.find(
      (element) =>
        element.matches('[aria-invalid="true"]') ||
        element.querySelector('[aria-invalid="true"]'),
    ) || matches[0];
  if (!target) return false;
  for (let parent = target.parentElement; parent; parent = parent.parentElement)
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  const control = target.matches(controls)
    ? target
    : target.querySelector<HTMLElement>('[aria-invalid="true"]') ||
      target.querySelector<HTMLElement>(controls);
  if (!control) return false;
  document
    .querySelectorAll(".validation-target")
    .forEach((element) => element.classList.remove("validation-target"));
  const frame =
    control.closest(".field, .verification-check, .assignment-controls") ||
    control;
  frame.classList.add("validation-target");
  control.focus({ preventScroll: true });
  control.scrollIntoView({
    block: "center",
    behavior: document.defaultView?.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth",
  });
  setTimeout(() => frame.classList.remove("validation-target"), 2500);
  return true;
}
