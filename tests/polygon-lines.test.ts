import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { paddlePanel } from "../src/lib/paddle-layout";
import { assembleRecognition } from "../src/lib/receipt-layout";
import { parseReceiptWithSources } from "../src/lib/parser";
import { workerEnvironment } from "../server/local-ocr.mjs";

const fragment = (
  text: string,
  x: number,
  baseline: number,
  width: number,
  slope: number,
) => ({
  text,
  score: 0.99,
  poly: [
    [x, baseline + slope * x],
    [x + width, baseline + slope * (x + width)],
    [x + width, baseline + slope * (x + width) + 18],
    [x, baseline + slope * x + 18],
  ],
});
function tiltedReceipt() {
  const items = [fragment("CORNER MARKET GBP", 40, 40, 330, 0)];
  for (const [index, slope] of [-0.03, -0.05, -0.065].entries()) {
    const base = 180 + index * 80;
    items.push(
      fragment(index < 2 ? "Milk bottles" : "Bread", 40, base - 40, 210, slope),
    );
    for (const [text, x, width] of [
      [index < 2 ? "123456" : "234567", 40, 100],
      [index < 2 ? "2x" : "1x", 250, 45],
      [index < 2 ? "3.00" : "2.00", 390, 75],
      [index < 2 ? "6.00 Z" : "2.00 Z", 550, 115],
    ] as const)
      items.push(fragment(text, x, base, width, slope));
  }
  items.push(fragment("TOTAL GBP 14.00", 40, 460, 330, 0));
  return [{ image: { width: 800, height: 600 }, items: items.reverse() }];
}

describe("detector-angle reading order", () => {
  it("recovers all printed columns and keeps two genuinely repeated purchases", () => {
    const input = tiltedReceipt();
    const original = structuredClone(input);
    const panel = paddlePanel(input, 800, 600, 1, 1);
    expect(panel.lines.map((line) => line.text)).toEqual([
      "CORNER MARKET GBP",
      "Milk bottles",
      "123456 2x 3.00 6.00 Z",
      "Milk bottles",
      "123456 2x 3.00 6.00 Z",
      "Bread",
      "234567 1x 2.00 2.00 Z",
      "TOTAL GBP 14.00",
    ]);
    const recognition = {
      engine: "paddle-ppocrv6-medium-onnx" as const,
      panels: [panel],
    };
    const assembled = assembleRecognition(recognition);
    const { receipt } = parseReceiptWithSources({ ...assembled, recognition });
    expect(
      receipt.items.map((item) => [
        item.description,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
      ]),
    ).toEqual([
      ["Milk bottles", "2", "3.00", "6.00"],
      ["Milk bottles", "2", "3.00", "6.00"],
      ["Bread", "1", "2.00", "2.00"],
    ]);
    expect(receipt.printedTotal).toBe("14.00");
    expect(panel.words.map((w) => w.text)).toEqual(
      input[0].items.map((w) => w.text),
    );
    expect(input).toEqual(original);
  });

  it("keeps literal negative and unclear money tokens instead of repairing them", () => {
    const input = tiltedReceipt();
    input[0].items.find((w) => w.text === "2.00 Z")!.text = "2.O0-A";
    const panel = paddlePanel(input, 800, 600, 1, 1);
    expect(
      panel.lines.some((line) => line.text === "234567 1x 2.00 2.O0-A"),
    ).toBe(true);
    expect(panel.words.some((word) => word.text === "2.O0-A")).toBe(true);
  });

  it("uses the same grouping in the native Paddle adapter without importing a model", () => {
    const input = tiltedReceipt();
    const expected = paddlePanel(input, 800, 600, 1, 1);
    const script = `import sys,json,types
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from local_ocr_models import PaddleAdapter
sdk=json.load(sys.stdin)[0]
class ImageContext:
 size=(sdk['image']['width'],sdk['image']['height'])
 def __enter__(self):return self
 def __exit__(self,*_):pass
sys.modules['PIL']=types.SimpleNamespace(Image=types.SimpleNamespace(open=lambda _:ImageContext()))
adapter=PaddleAdapter.__new__(PaddleAdapter)
adapter.model=types.SimpleNamespace(predict=lambda _:[{'rec_texts':[i['text'] for i in sdk['items']], 'rec_scores':[i['score'] for i in sdk['items']], 'rec_polys':[i['poly'] for i in sdk['items']]}])
json.dump(adapter.recognize(Path('synthetic.jpg')),sys.stdout)
`;
    const output = execFileSync(
      process.platform === "win32" ? "python" : "python3",
      ["-I", "-c", script, resolve("server")],
      {
        input: JSON.stringify(input),
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
        env: workerEnvironment(),
      },
    );
    const native = JSON.parse(output);
    expect(native.words).toEqual(expected.words);
    expect(native.lines).toEqual(expected.lines);
  });

  it("retains unsupported steeply rotated detections without dropping or rewriting them", () => {
    const items = ["Milk", "2.50", "Bread", "1.20"].map((text, i) =>
      fragment(text, 20, 100 + i * 80, 100, 0.4),
    );
    const panel = paddlePanel(
      [{ image: { width: 800, height: 600 }, items }],
      800,
      600,
      1,
      1,
    );
    expect(panel.words.map((w) => w.text)).toEqual(items.map((w) => w.text));
    expect(panel.lines.map((w) => w.text)).toEqual(items.map((w) => w.text));
  });
});
