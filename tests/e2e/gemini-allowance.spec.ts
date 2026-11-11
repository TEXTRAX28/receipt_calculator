import { expect, test, type Page } from "./editor-fixture";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createReceiptApi } from "../../server/receipt-api.mjs";
import { qaArtifactPath } from "./qa-artifacts";

async function backend(page: Page, enabled: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "gather-gemini-browser-"));
  let calls = 0;
  const statusResponses: unknown[] = [];
  const handler = createReceiptApi({
    apiKey: "synthetic-browser-key",
    geminiAllowance: enabled
      ? { directory, grant: "offline-browser-grant", limit: 1 }
      : undefined,
    fetcher: async () => {
      calls++;
      return new Response("synthetic provider quota failure", { status: 429 });
    },
  });
  const server = createServer((req, res) => {
    void handler(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.route("**/api/receipts/config", async (route) => {
    const response = await fetch(base + "/api/receipts/config");
    const json = await response.json();
    statusResponses.push(json);
    await route.fulfill({ status: response.status, json });
  });
  await page.route("**/api/receipts/extract", async (route) => {
    const response = await fetch(base + "/api/receipts/extract", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body: route.request().postData(),
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  return {
    calls: () => calls,
    statusResponses,
    async close() {
      await new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      });
      if (
        !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
        !directory.includes("gather-gemini-browser-")
      )
        throw Error("Unsafe temporary directory");
      await rm(directory, { recursive: true, force: true });
    },
  };
}
async function upload(page: Page, assisted = true) {
  await page.goto("/");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 700;
    const x = c.getContext("2d")!;
    x.fillStyle = "white";
    x.fillRect(0, 0, 700, 700);
    x.fillStyle = "black";
    x.font = "25px monospace";
    ["SYNTHETIC MARKET", "Tea 2x 2.50 5.00", "TOTAL GBP 5.00"].forEach(
      (line, i) => x.fillText(line, 30, 70 + i * 70),
    );
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-allowance.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  if (assisted)
    await page
      .getByRole("button", { name: "Assisted scan · Gemini", exact: true })
      .click();
}

test("a Gemini key without a server allowance leaves only the private scan flow", async ({
  page,
}, info) => {
  const fixture = await backend(page, false);
  try {
    await upload(page, false);
    await expect(
      page.getByRole("button", { name: "Assisted scan · Gemini", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Read receipt with Gemini",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Read receipt on this device",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(page.locator(".selected-image")).toHaveCount(1);
    expect(fixture.calls()).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: await qaArtifactPath(
        info,
        `gemini-allowance-setup-${info.project.name}.png`,
      ),
    });
  } finally {
    await fixture.close();
  }
});

test("Gemini quota failure keeps photos and refreshes the spent server allowance without retry", async ({
  page,
}, info) => {
  const fixture = await backend(page, true);
  try {
    await upload(page);
    await expect(
      page.getByText(/1 scan left in this server's allowance/),
    ).toBeVisible();
    await page
      .getByRole("checkbox", {
        name: "Send these receipt photos to Google Gemini for this scan",
        exact: true,
      })
      .check();
    const scan = page.getByRole("button", {
      name: "Read receipt with Gemini",
      exact: true,
    });
    await scan.click();
    await expect(
      page.getByText(/Gemini's usage limit was reached/),
    ).toBeVisible();
    await expect(
      page.getByText(
        "This server's Gemini scan allowance has been used. Choose an on-device reader to continue.",
      ),
    ).toBeVisible();
    await expect(scan).toBeDisabled();
    await expect(page.locator(".selected-image")).toHaveCount(1);
    await expect(
      page.getByRole("checkbox", {
        name: "Send these receipt photos to Google Gemini for this scan",
        exact: true,
      }),
    ).not.toBeChecked();
    expect(fixture.calls()).toBe(1);
    expect(fixture.statusResponses).toContainEqual(
      expect.objectContaining({
        configured: false,
        remaining: 0,
        availability: "exhausted",
      }),
    );
    await page.screenshot({
      path: await qaArtifactPath(
        info,
        `gemini-allowance-exhausted-${info.project.name}.png`,
      ),
    });
    await page
      .getByRole("button", { name: "On-device scan", exact: true })
      .click();
    await expect(page.locator(".selected-image")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(fixture.calls()).toBe(1);
  } finally {
    await fixture.close();
  }
});
