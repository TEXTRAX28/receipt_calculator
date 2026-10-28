import {
  newItem,
  newState,
  receiptStamp,
  type AppState,
  type Assignment,
} from "../src/lib/model";
import { money, minorString } from "../src/lib/money";
export function shop(
  prices = ["10.00"],
  names = ["Alice", "Bob", "Charlie"],
): AppState {
  const state = newState();
  state.receipt.merchant = "Test shop";
  state.receipt.printedTotal = minorString(
    prices.reduce((a, p) => a + money(p, "GBP"), 0n),
    "GBP",
  );
  state.receipt.items = prices.map((price, i) => ({
    ...newItem(),
    description: `Item ${i + 1}`,
    quantity: "1",
    lineTotal: price,
  }));
  state.people = names.map((name, i) => ({ id: `person-${i}`, name }));
  state.reviewedStamp = receiptStamp(state.receipt);
  return state;
}
export function assign(
  state: AppState,
  mode: Assignment["mode"],
  values: string[] = [],
  index = 0,
) {
  const assignment: Assignment = {
    mode,
    participants: state.people.map((p) => p.id),
    values: Object.fromEntries(
      state.people.map((p, i) => [p.id, values[i] || "1"]),
    ),
  };
  state.receipt.items[index].assignment = assignment;
  return assignment;
}
export function review(state: AppState) {
  state.reviewedStamp = receiptStamp(state.receipt);
  return state;
}
