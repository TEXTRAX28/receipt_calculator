import type { AppState, Assignment, Item, Person, Receipt } from "./model";
import { receiptStamp } from "./model";
import { allocate, money, roundDiv, SCALE, weight, formatMoney } from "./money";
import { pendingReviewIssues } from "./review-checks";

export interface Issue {
  path: string;
  message: string;
}
export interface ItemCost {
  id: string;
  net: bigint;
  receiptDiscount: bigint;
  tax: bigint;
  charges: bigint;
  total: bigint;
}
export interface ReceiptResult {
  issues: Issue[];
  items: ItemCost[];
  subtotal: bigint;
  receiptDiscount: bigint;
  tax: bigint;
  otherCharges: bigint;
  total: bigint;
  printed: bigint | null;
  discrepancy: bigint | null;
  equalCharges: { label: string; amount: bigint; kind: "tax" | "other" }[];
}
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

export function calculateReceipt(receipt: Receipt): ReceiptResult {
  if (receipt.currencyUnresolved)
    return {
      issues: [
        {
          path: "currency",
          message:
            "Choose the receipt currency before calculating or confirming amounts.",
        },
      ],
      // Decimal precision depends on the currency. Keep the original strings untouched
      // until it is chosen; these placeholders are not displayable money amounts.
      items: receipt.items.map(({ id }) => ({
        id,
        net: 0n,
        receiptDiscount: 0n,
        tax: 0n,
        charges: 0n,
        total: 0n,
      })),
      subtotal: 0n,
      receiptDiscount: 0n,
      tax: 0n,
      otherCharges: 0n,
      total: 0n,
      printed: null,
      discrepancy: null,
      equalCharges: [],
    };
  const issues: Issue[] = pendingReviewIssues(receipt);
  const issue = (path: string, message: string) =>
    issues.push({ path, message });
  const read = (value: string, path: string, signed = false) => {
    try {
      return money(value, receipt.currency, signed);
    } catch (e) {
      issue(path, (e as Error).message);
      return 0n;
    }
  };
  if (!receipt.merchant.trim()) issue("merchant", "Enter the merchant name.");
  if (receipt.date) {
    const parsedDate = new Date(receipt.date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(receipt.date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== receipt.date
    )
      issue("date", "Enter a valid receipt date or leave it blank.");
  }
  if (!receipt.items.length)
    issue(
      "items",
      "Add at least one item, or a single line for the whole purchase.",
    );
  if (new Set(receipt.items.map((i) => i.id)).size !== receipt.items.length)
    issue("items", "Item identifiers must be unique.");
  const items: ItemCost[] = receipt.items.map((item, index) => {
    const path = `items.${index}`;
    if (!item.description.trim())
      issue(`${path}.description`, `Item ${index + 1}: enter a description.`);
    let quantity = 0n;
    try {
      quantity = weight(item.quantity);
      if (!quantity)
        throw new Error("Purchased quantity must be greater than zero.");
    } catch (e) {
      issue(
        `${path}.quantity`,
        `${item.description || `Item ${index + 1}`}: ${(e as Error).message}`,
      );
    }
    let amount = 0n;
    if (item.lineTotal !== "")
      amount = read(item.lineTotal, `${path}.lineTotal`);
    else if (item.unitPrice !== "")
      amount = roundDiv(
        read(item.unitPrice, `${path}.unitPrice`) * quantity,
        SCALE,
      );
    else
      issue(
        `${path}.lineTotal`,
        `${item.description || `Item ${index + 1}`}: enter a line total or unit price.`,
      );
    if (item.unitPrice !== "" && item.lineTotal !== "") {
      const expected = roundDiv(
        read(item.unitPrice, `${path}.unitPrice`) * quantity,
        SCALE,
      );
      if (expected !== amount)
        issue(
          `${path}.unitPrice`,
          `${item.description}: quantity × unit price differs from the line total. Correct either field, or clear the optional unit price.`,
        );
    }
    const discount = read(item.discount || "0", `${path}.discount`);
    if (discount > amount)
      issue(
        `${path}.discount`,
        `${item.description}: discount exceeds the item price.`,
      );
    return {
      id: item.id,
      net: amount >= discount ? amount - discount : 0n,
      receiptDiscount: 0n,
      tax: 0n,
      charges: 0n,
      total: 0n,
    };
  });
  const subtotal = sum(items.map((i) => i.net));
  if (
    receipt.subtotal !== "" &&
    read(receipt.subtotal, "subtotal") !== subtotal
  )
    issue(
      "subtotal",
      "Printed subtotal differs from the item total after item discounts. Check the items or correct this optional subtotal.",
    );
  const receiptDiscount = sum(
    receipt.adjustments
      .filter((a) => a.kind === "discount")
      .map((a) => {
        if (!a.label.trim())
          issue(`adjustments.${a.id}`, "Give every adjustment a clear label.");
        return read(a.amount, `adjustments.${a.id}`);
      }),
  );
  if (receiptDiscount > subtotal)
    issue("adjustments", "Receipt-wide discounts exceed the item subtotal.");
  if (subtotal > 0n) {
    const shares = allocate(
      receiptDiscount <= subtotal ? receiptDiscount : subtotal,
      items.map((i) => i.net),
    );
    items.forEach((item, i) => {
      item.receiptDiscount = shares[i];
    });
  }
  const afterDiscount = items.map((i) => i.net - i.receiptDiscount);
  if (!receipt.pricesIncludeTax && receipt.taxMode === "codes") {
    const groups = new Map<string, { rate: bigint; indexes: number[] }>();
    for (const entry of receipt.taxCodes) {
      if (!entry.code.trim() || groups.has(entry.code)) {
        issue("taxCodes", "Tax codes must be non-empty and unique.");
        continue;
      }
      try {
        const rate = weight(entry.rate);
        if (rate > 100n * SCALE)
          throw new Error("Tax rates must be between 0 and 100%.");
        groups.set(entry.code, { rate, indexes: [] });
      } catch (e) {
        issue("taxCodes", `Code ${entry.code}: ${(e as Error).message}`);
      }
    }
    receipt.items.forEach((item, index) => {
      const group = groups.get(item.taxCode);
      if (!group)
        issue(
          `items.${index}.taxCode`,
          `${item.description}: choose a tax code and define its rate from the receipt.`,
        );
      else group.indexes.push(index);
    });
    for (const group of groups.values()) {
      const costs = group.indexes.map((i) => afterDiscount[i]);
      const tax = roundDiv(sum(costs) * group.rate, 100n * SCALE);
      const taxes = allocate(tax, costs);
      group.indexes.forEach((index, j) => {
        items[index].tax = taxes[j];
      });
    }
    if (receipt.adjustments.some((a) => a.kind === "tax"))
      issue(
        "taxMode",
        "Choose either item tax codes or a printed tax amount. Remove the extra tax row to avoid adding tax twice.",
      );
  }
  const equalCharges: ReceiptResult["equalCharges"] = [];
  let otherCharges = 0n;
  let printedTax = 0n;
  const allocationWeights = items.map(
    (i, index) => afterDiscount[index] + i.tax,
  );
  for (const adjustment of receipt.adjustments.filter(
    (a) => a.kind !== "discount",
  )) {
    if (!adjustment.label.trim())
      issue(
        `adjustments.${adjustment.id}`,
        "Give every adjustment a clear label (including the reason for rounding).",
      );
    const amount = read(
      adjustment.amount,
      `adjustments.${adjustment.id}`,
      adjustment.kind === "rounding",
    );
    if (
      adjustment.kind === "tax" &&
      (receipt.pricesIncludeTax || receipt.taxMode === "codes")
    )
      continue;
    if (adjustment.kind === "tax") printedTax += amount;
    else otherCharges += amount;
    if (adjustment.allocation === "equal-people")
      equalCharges.push({
        label: adjustment.label,
        amount,
        kind: adjustment.kind === "tax" ? "tax" : "other",
      });
    else if (sum(allocationWeights) > 0n) {
      const shares = allocate(amount, allocationWeights);
      items.forEach((item, i) => {
        if (adjustment.kind === "tax") item.tax += shares[i];
        else item.charges += shares[i];
      });
    } else if (amount)
      issue(
        `adjustments.${adjustment.id}`,
        "A proportional adjustment needs a positive item subtotal. Choose equal per person or add priced items.",
      );
  }
  items.forEach((i) => {
    i.total = i.net - i.receiptDiscount + i.tax + i.charges;
    if (i.total < 0n)
      issue(
        `items.${i.id}`,
        "An adjustment makes an item cost negative. Review its amount or allocation.",
      );
  });
  const tax =
    receipt.taxMode === "codes" && !receipt.pricesIncludeTax
      ? sum(items.map((i) => i.tax))
      : printedTax;
  if (receipt.printedTax) {
    const statedTax = read(receipt.printedTax, "printedTax");
    if (!receipt.pricesIncludeTax && statedTax !== tax)
      issue(
        "printedTax",
        "Calculated added tax differs from the printed tax check. Correct the tax rates or use a printed tax adjustment instead.",
      );
  }
  const total = subtotal - receiptDiscount + tax + otherCharges;
  if (total < 0n) issue("total", "The receipt total cannot be negative.");
  let printed: bigint | null = null;
  if (receipt.printedTotal === "")
    issue(
      "printedTotal",
      "Enter the printed receipt total to check the arithmetic.",
    );
  else printed = read(receipt.printedTotal, "printedTotal");
  const discrepancy = printed === null ? null : total - printed;
  if (discrepancy !== null && discrepancy !== 0n)
    issue(
      "printedTotal",
      `Calculated total ${formatMoney(total, receipt.currency)} differs from the printed total by ${formatMoney(discrepancy, receipt.currency)}. Correct the items, tax or adjustments before continuing.`,
    );
  return {
    issues,
    items,
    subtotal,
    receiptDiscount,
    tax,
    otherCharges,
    total,
    printed,
    discrepancy,
    equalCharges,
  };
}

export interface AssignmentResult {
  weights: bigint[];
  issue?: string;
  status: "unassigned" | "partial" | "complete";
  remaining?: bigint;
}
export function assignmentWeights(
  assignment: Assignment,
  people: Person[],
  item?: Item,
): AssignmentResult {
  const blank = people.map(() => 0n);
  if (!assignment.participants.length)
    return {
      weights: blank,
      issue: "Choose who shares this cost.",
      status: "unassigned",
    };
  if (
    new Set(assignment.participants).size !== assignment.participants.length ||
    assignment.participants.some((id) => !people.some((p) => p.id === id))
  )
    return {
      weights: blank,
      issue:
        "An assignment refers to a removed or duplicate person. Select the people again.",
      status: "partial",
    };
  try {
    const weights = people.map((person) => {
      if (!assignment.participants.includes(person.id)) return 0n;
      const amount =
        assignment.mode === "equal"
          ? SCALE
          : weight(assignment.values[person.id] || "");
      if (amount <= 0n)
        throw new Error("Enter a positive share for each selected person.");
      if (
        assignment.mode === "quantity" &&
        item?.unitKind === "whole" &&
        amount % SCALE
      )
        throw new Error(
          "Use whole quantities for indivisible units. Choose measured goods for decimal quantities.",
        );
      return amount;
    });
    if (assignment.mode === "percent" && sum(weights) !== 100n * SCALE)
      return {
        weights,
        issue: "Percentages must total exactly 100%.",
        status: "partial",
      };
    if (assignment.mode === "quantity") {
      if (!item)
        throw new Error(
          "Physical quantities are available only for individual items.",
        );
      if (!item.packSize.trim())
        throw new Error(
          "Confirm units per purchased pack before splitting physical quantities.",
        );
      const packs = weight(item.quantity);
      const pack = weight(item.packSize);
      if (!pack || !packs)
        throw new Error(
          "Confirm units per purchased pack before splitting physical quantities.",
        );
      if (item.unitKind === "whole" && (packs % SCALE || pack % SCALE))
        throw new Error(
          "Purchased packs and units per pack must be whole numbers for indivisible units.",
        );
      if ((packs * pack) % SCALE)
        throw new Error(
          "Available quantity requires more than six decimal places.",
        );
      const available = (packs * pack) / SCALE;
      const remaining = available - sum(weights);
      if (remaining !== 0n)
        return {
          weights,
          remaining,
          issue:
            remaining > 0n
              ? `${quantityText(remaining)} units still need assigning (${quantityText(available)} available).`
              : `You assigned ${quantityText(-remaining)} units too many (${quantityText(available)} available). Correct the quantities.`,
          status: "partial",
        };
    }
    return { weights, status: "complete" };
  } catch (e) {
    return { weights: blank, issue: (e as Error).message, status: "partial" };
  }
}
export function quantityText(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const n = value < 0n ? -value : value;
  const fraction = (n % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${n / SCALE}${fraction ? `.${fraction}` : ""}`;
}
export interface PersonLine {
  label: string;
  detail: string;
  net: bigint;
  tax: bigint;
  charges: bigint;
  rounding: bigint;
  amount: bigint;
}
export interface PersonTotal {
  person: Person;
  total: bigint;
  lines: PersonLine[];
}
export function calculateSplit(state: AppState) {
  const receipt = calculateReceipt(state.receipt);
  const issues = [...receipt.issues];
  if (state.reviewedStamp !== receiptStamp(state.receipt))
    issues.push({
      path: "review",
      message: "Review and confirm the receipt details before finalizing.",
    });
  if (!state.people.length)
    issues.push({ path: "people", message: "Add at least one person." });
  if (new Set(state.people.map((p) => p.id)).size !== state.people.length)
    issues.push({
      path: "people",
      message: "Participant identifiers must be unique.",
    });
  for (const p of state.people)
    if (!p.name.trim())
      issues.push({ path: "people", message: "Every person needs a name." });
  const totals: PersonTotal[] = state.people.map((person) => ({
    person,
    total: 0n,
    lines: [],
  }));
  const statuses = new Map<string, AssignmentResult>();
  const push = (
    weights: bigint[],
    label: string,
    detail: string,
    net: bigint,
    tax: bigint,
    charges: bigint,
  ) => {
    try {
      const ns = allocate(net, weights),
        ts = allocate(tax, weights),
        cs = allocate(charges, weights);
      const finalAmounts = allocate(net + tax + charges, weights);
      totals.forEach((person, i) => {
        if (!weights[i]) return;
        const amount = finalAmounts[i];
        const rounding = amount - ns[i] - ts[i] - cs[i];
        person.total += amount;
        person.lines.push({
          label,
          detail,
          net: ns[i],
          tax: ts[i],
          charges: cs[i],
          rounding,
          amount,
        });
      });
    } catch (e) {
      issues.push({ path: "assignments", message: (e as Error).message });
    }
  };
  if (state.splitMode === "whole") {
    const assignment = assignmentWeights(state.wholeAssignment, state.people);
    statuses.set("whole", assignment);
    if (assignment.issue)
      issues.push({ path: "whole", message: assignment.issue });
    if (assignment.status === "complete") {
      push(
        assignment.weights,
        "Whole receipt",
        `${state.wholeAssignment.mode} shares of the whole receipt`,
        receipt.subtotal - receipt.receiptDiscount,
        receipt.tax,
        receipt.otherCharges,
      );
      totals.forEach((person) => {
        const line = person.lines.at(-1);
        if (line)
          line.detail =
            state.wholeAssignment.mode === "equal"
              ? `1/${state.wholeAssignment.participants.length} equal share of the whole receipt`
              : state.wholeAssignment.mode === "percent"
                ? `${state.wholeAssignment.values[person.person.id]}% of the whole receipt`
                : `${state.wholeAssignment.values[person.person.id]}/${quantityText(sum(assignment.weights))} cost shares of the whole receipt`;
      });
    }
  } else {
    state.receipt.items.forEach((item, i) => {
      const assignment = assignmentWeights(item.assignment, state.people, item);
      statuses.set(item.id, assignment);
      if (assignment.issue)
        issues.push({
          path: `assignment.${item.id}`,
          message: `${item.description || "Item"}: ${assignment.issue}`,
        });
      if (assignment.status === "complete") {
        const cost = receipt.items[i];
        const details =
          item.assignment.mode === "equal"
            ? `Equal share among ${item.assignment.participants.length}`
            : `${item.assignment.mode} shares`;
        push(
          assignment.weights,
          item.description,
          details,
          cost.net - cost.receiptDiscount,
          cost.tax,
          cost.charges,
        );
        totals.forEach((person, index) => {
          const line = person.lines.at(-1);
          if (assignment.weights[index] && line) {
            const value = item.assignment.values[person.person.id];
            const denominator = quantityText(sum(assignment.weights));
            line.detail =
              item.assignment.mode === "equal"
                ? `1/${item.assignment.participants.length} equal share`
                : item.assignment.mode === "quantity"
                  ? `${value} of ${denominator} units (${item.quantity} purchased × ${item.packSize} per pack)`
                  : item.assignment.mode === "percent"
                    ? `${value}% of item cost`
                    : `${value}/${denominator} cost shares`;
          }
        });
      }
    });
    if (state.people.length)
      receipt.equalCharges.forEach((charge) =>
        push(
          state.people.map(() => 1n),
          charge.label,
          "Equal share among everyone",
          0n,
          charge.kind === "tax" ? charge.amount : 0n,
          charge.kind === "other" ? charge.amount : 0n,
        ),
      );
  }
  const assignedTotal = sum(totals.map((p) => p.total));
  if (totals.some((p) => p.total < 0n))
    issues.push({
      path: "assignments",
      message:
        "An adjustment creates a negative amount owed. Review the adjustment allocation.",
    });
  if (!issues.length && assignedTotal !== receipt.total)
    issues.push({
      path: "assignments",
      message:
        "Allocations do not reconcile. Review all charges and assignments.",
    });
  return {
    receipt,
    totals,
    issues,
    statuses,
    assignedTotal,
    canFinalize:
      !issues.length &&
      receipt.printed !== null &&
      assignedTotal === receipt.printed,
  };
}

export function removePerson(state: AppState, personId: string): AppState {
  const clean = (a: Assignment): Assignment => ({
    ...a,
    participants: a.participants.filter((id) => id !== personId),
    values: Object.fromEntries(
      Object.entries(a.values).filter(([id]) => id !== personId),
    ),
  });
  return {
    ...state,
    people: state.people.filter((p) => p.id !== personId),
    wholeAssignment: clean(state.wholeAssignment),
    receipt: {
      ...state.receipt,
      items: state.receipt.items.map((item) => ({
        ...item,
        assignment: clean(item.assignment),
      })),
    },
    finalizedStamp: "",
  };
}
