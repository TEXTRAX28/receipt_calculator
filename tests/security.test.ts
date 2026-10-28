import { describe, expect, it } from "vitest";
import { inspectImage, MAX_IMAGE_BYTES, cropImage } from "../src/lib/images";
import { appSchema, newState } from "../src/lib/model";
import { loadDraft, saveDraft, STORAGE_KEY } from "../src/lib/storage";
import { shop } from "./helpers";
function png(width = 100, height = 200) {
  const bytes = new Uint8Array(30);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
describe("untrusted uploads and saved drafts", () => {
  it("rejects excessive or non-finite crop bounds before decoding", async () => {
    const image = {
      id: "test",
      name: "test",
      url: "blob:test",
      blob: new Blob([]),
    };
    await expect(
      cropImage(image, { left: 90, right: 90, top: 0, bottom: 0 }),
    ).rejects.toThrow(/visible receipt area/);
    await expect(
      cropImage(image, { left: NaN, right: 0, top: 0, bottom: 0 }),
    ).rejects.toThrow(/visible receipt area/);
  });
  it("validates signature and dimensions before decode", () =>
    expect(inspectImage(png(), "image/png")).toEqual({
      type: "image/png",
      width: 100,
      height: 200,
    }));
  it("rejects disguised SVG, HTML and invalid image data", () => {
    for (const text of [
      '<svg onload="alert(1)"></svg>',
      "<html>not an image</html>",
      "not a real jpeg".repeat(3),
    ])
      expect(() =>
        inspectImage(new TextEncoder().encode(text), "image/jpeg"),
      ).toThrow();
  });
  it("rejects type spoofing, oversized files and pixel bombs", () => {
    expect(() => inspectImage(png(), "image/jpeg")).toThrow(/signature/);
    expect(() => inspectImage(png(), "image/png", MAX_IMAGE_BYTES + 1)).toThrow(
      /12 MB/,
    );
    expect(() => inspectImage(png(10000, 10000), "image/png")).toThrow(
      /megapixels/,
    );
    expect(() => inspectImage(png(0, 10), "image/png")).toThrow();
  });
  it("rejects truncated JPEG segments", () => {
    const bytes = new Uint8Array(30);
    bytes.set([255, 216, 255, 224, 255, 255]);
    expect(() => inspectImage(bytes, "image/jpeg")).toThrow();
  });
  it("validates structured state, including bounded text and duplicate IDs", () => {
    const s = shop(["1.00"], ["Alice"]);
    s.people.push({ ...s.people[0] });
    expect(appSchema.safeParse(s).success).toBe(false);
    const huge = newState();
    huge.receipt.merchant = "x".repeat(10000);
    expect(appSchema.safeParse(huge).success).toBe(false);
  });
  it("recovers from invalid or oversized storage instead of trusting it", () => {
    for (const raw of [
      "{invalid",
      "x".repeat(800001),
      JSON.stringify({ version: 9, receipt: {} }),
    ]) {
      const r = loadDraft({ getItem: () => raw });
      expect(r.warning).toMatch(/could not be read/);
      expect(r.state.receipt.items).toEqual([]);
    }
  });
  it("does not persist images or raw OCR text", () => {
    const s = shop();
    s.receipt.rawText = "PRIVATE PAYMENT FRAGMENT";
    let saved = "";
    saveDraft(
      {
        setItem: (key, value) => {
          expect(key).toBe(STORAGE_KEY);
          saved = value;
        },
      },
      s,
    );
    expect(saved).not.toContain("PRIVATE PAYMENT");
    expect(JSON.parse(saved).receipt.rawText).toBe("");
  });
  it("reports unavailable storage for caller recovery", () =>
    expect(() =>
      saveDraft(
        {
          setItem: () => {
            throw new Error("Quota exceeded");
          },
        },
        shop(),
      ),
    ).toThrow(/Quota/));
});
