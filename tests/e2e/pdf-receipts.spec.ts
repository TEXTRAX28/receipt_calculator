import { expect, test, type Page } from "./editor-fixture";
import path from "node:path";

const fixture = (name: string) => path.resolve("tests/fixtures/pdfs", name);
async function setup(page: Page) {
  const requests = { posts: [] as string[], external: [] as string[] };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "data:" ||
      (["http:", "blob:"].includes(url.protocol) &&
        url.origin === new URL(test.info().project.use.baseURL!).origin)
    )
      return route.continue();
    requests.external.push(url.origin);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      requests.posts.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  return requests;
}

test("password, page-count, dimension and malformed failures retain earlier pages and release the worker", async ({
  page,
}) => {
  const requests = await setup(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("scanned-one-page.pdf"));
  await expect(page.locator(".selected-image")).toHaveCount(1);
  for (const [name, message] of [
    ["password-protected.pdf", /Password-protected/],
    ["thirteen-pages.pdf", /13 pages/],
    ["oversized-page.pdf", /dimensions/],
    ["oversized-image.pdf", /could not be read safely/],
  ] as const) {
    await page.getByLabel("Upload receipt images").setInputFiles(fixture(name));
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.locator(".selected-image")).toHaveCount(1);
    await expect.poll(() => page.workers().length).toBe(0);
  }
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nnot a valid PDF"),
  });
  await expect(page.getByRole("alert")).toContainText(
    /could not be read safely/,
  );
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(requests).toEqual({ posts: [], external: [] });
});

test("a rotated PDF keeps its preview and can be scanned with OpenAI", async ({
  page,
}) => {
  const requests = await setup(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("rotated-page.pdf"));
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Read PDF text on this device",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Read receipt with OpenAI credits",
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toEqual({ posts: [], external: [] });
});

test("canceling a first PDF import keeps the capture screen usable and stops its owned worker", async ({
  page,
}) => {
  const requests = await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*pdf.worker*.mjs", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("digital-two-page.pdf"));
  await expect(
    page.getByRole("button", { name: "Cancel import", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
  release();
  await expect(page.getByRole("alert")).toContainText(/cancelled/);
  await expect(page.locator(".selected-image")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Upload receipt", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(requests).toEqual({ posts: [], external: [] });
});
