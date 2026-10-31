// Protocol fixture only. This does not decode images or simulate OCR accuracy.
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";

const engine = process.argv.includes("doctr")
  ? "doctr-db-resnet50-parseq-cpu"
  : "paddle-ppocrv6-medium-onnx";
console.log(JSON.stringify({ ready: true, engine }));
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const { panels } = JSON.parse(line);
  const tag = readFileSync(panels[0].path).subarray(8).toString();
  if (tag === "stall") return;
  if (tag === "exit") return process.exit(23);
  if (tag === "oversize")
    return process.stdout.write("x".repeat(1024 * 1024 + 1));
  const text =
    tag === "env"
      ? process.env.GEMINI_API_KEY ||
        process.env.AWS_SECRET_ACCESS_KEY ||
        "NO_KEYS"
      : tag;
  const region = {
    text,
    confidence: tag === "bad-score" ? 2 : 0.95,
    box: [0.1, 0.1, 0.8, 0.2],
  };
  const value = {
    engine,
    panels: panels.map((p) => ({
      photo: tag === "wrong-photo" ? 12 : p.photo,
      part: p.part,
      width: 160,
      height: 320,
      words: [region],
      lines: [region],
    })),
  };
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  if (tag === "牛奶") {
    const split = bytes.indexOf(Buffer.from("牛")) + 1;
    process.stdout.write(bytes.subarray(0, split));
    setTimeout(() => process.stdout.write(bytes.subarray(split)), 15);
  } else process.stdout.write(bytes);
});
