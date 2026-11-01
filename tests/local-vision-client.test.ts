import { afterEach, expect, it, vi } from "vitest";
import { extractLocalVisionEvidence } from "../src/lib/local-vision";
import { panelsForImages } from "../src/lib/panel-transport";
import { aiCostcoDraft } from "./fixtures/ai-receipt";

vi.mock("../src/lib/panel-transport", () => ({ panelsForImages: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function clockedRead(delay: number, parts = 1) {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((duration) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);
    return controller.signal;
  });
  const panels = Array.from({ length: parts }, (_, index) => ({
    photo: 1,
    part: index + 1,
    data: "synthetic-jpeg",
  }));
  vi.mocked(panelsForImages).mockResolvedValue(panels);
  const fetch = vi.fn((_url: string, options: RequestInit) => {
    const signal = options.signal!;
    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
      setTimeout(
        () =>
          resolve(new Response(JSON.stringify({ receipt: aiCostcoDraft() }))),
        delay,
      );
    });
  });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const result = extractLocalVisionEvidence([], controller.signal, vi.fn());
  const outcome = result.then(
    (value) => ({ value, error: "" }),
    (error: Error) => ({ value: null, error: error.message }),
  );
  return { outcome, controller, fetch, panels };
}

it.each([1, 2])(
  "accepts a detailed one-photo response after the previous deadline (%i sections)",
  async (parts) => {
    const { outcome, fetch, panels } = clockedRead(190000, parts);
    await vi.advanceTimersByTimeAsync(190000);
    expect(await outcome).toEqual({ value: aiCostcoDraft(), error: "" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({ panels });
  },
);

it("still stops a stalled response and preserves the retryable receipt message", async () => {
  const { outcome, fetch } = clockedRead(210000);
  await vi.advanceTimersByTimeAsync(205000);
  expect((await outcome).error).toMatch(
    /took too long.*photos are still available/,
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it("cancels immediately while a detailed receipt is still being read", async () => {
  const { outcome, controller, fetch } = clockedRead(190000);
  await vi.advanceTimersByTimeAsync(130000);
  controller.abort();
  expect((await outcome).error).toMatch(/Scan cancelled/);
  expect(fetch).toHaveBeenCalledOnce();
});
