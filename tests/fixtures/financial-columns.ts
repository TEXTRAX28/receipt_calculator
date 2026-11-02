import type { EvidenceLine, Recognition } from "../../src/lib/receipt-layout";

// Synthetic amounts in the slanted geometry of a familiar development footer.
// Deliberately retain the wrong OCR line grouping; the words are the evidence.
export function slantedSummary() {
  const word = (text: string, box: EvidenceLine["box"]) => ({
    text,
    box,
    confidence: 0.99,
  });
  const prefix = [
    word("Little Market", [0.1, 0.1, 0.5, 0.13]),
    word("Currency GBP", [0.1, 0.2, 0.5, 0.23]),
    word("Meal 1 x 18.00 18.00", [0.1, 0.3, 0.8, 0.33]),
  ];
  const words = [
    ...prefix,
    word("18.00", [0.588, 0.679, 0.7616, 0.7207]),
    word("SUBTOTAL", [0.1308, 0.6975, 0.3519, 0.7392]),
    word("2.00", [0.6123, 0.7137, 0.7639, 0.7569]),
    word("PB1", [0.1285, 0.74, 0.2176, 0.7793]),
    word("1.00", [0.6111, 0.7492, 0.7674, 0.7963]),
    word("SVC CHRG", [0.1296, 0.7755, 0.3565, 0.8194]),
    word("21.00", [0.3877, 0.7847, 0.7523, 0.8727]),
    word("DUE", [0.1204, 0.8117, 0.3102, 0.8889]),
  ];
  const sourceLines = [
    ...prefix,
    word("SUBTOTAL 18.00", [0.1308, 0.679, 0.7616, 0.7392]),
    word("2.00", [0.6123, 0.7137, 0.7639, 0.7569]),
    word("PB1 1.00", [0.1285, 0.74, 0.7674, 0.7963]),
    word("SVC CHRG", [0.1296, 0.7755, 0.3565, 0.8194]),
    word("DUE 21.00", [0.1204, 0.7847, 0.7523, 0.8889]),
  ];
  const recognition: Recognition = {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 700,
        height: 1400,
        words,
        lines: sourceLines,
      },
    ],
  };
  const lines: (EvidenceLine | null)[] = sourceLines.map((line) => ({
    ...line,
    photo: 1,
    part: 1,
  }));
  return { recognition, lines, words, sourceLines };
}
