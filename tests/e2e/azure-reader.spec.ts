import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";
import { createAzureReader } from "../../server/azure-reader.mjs";
import { createReceiptApi } from "../../server/receipt-api.mjs";
import { validatePreparedJpeg } from "../../server/receipt-zip.mjs";
import { AZURE_NOTICE } from "../../src/lib/azure-schema.mjs";
import { qaArtifactPath } from "./qa-artifacts";
import { azureQuantityFixture } from "../fixtures/azure-quantities";

// Actual app -> local HTTP API -> injected synthetic provider transport -> adapter.
// No request reaches Azure. This verifies integration, not recognition accuracy.
const rows = [
  "SYNTHETIC MARKET",
  "Tea 1x 5.50 5.50",
  "TOTAL GBP 5.50",
  "PRICES INCLUDE TAX",
];
const consentName =
  "Send these receipt sections to Azure for this scan. I have read the data-use notice above.";
async function picture(page: Page) {
  return {
    name: "synthetic-azure.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await page.evaluate((lines) => {
        const c = document.createElement("canvas");
        c.width = c.height = 700;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 700, 700);
        ctx.fillStyle = "black";
        ctx.font = "25px monospace";
        lines.forEach((line, i) => ctx.fillText(line, 40, 70 + i * 70));
        return c.toDataURL("image/png").split(",")[1];
      }, rows),
      "base64",
    ),
  };
}
async function backend(
  page: Page,
  options: { limit?: number; failure?: boolean; quantities?: boolean } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "gather-azure-browser-"));
  const endpoint = "https://synthetic-browser.cognitiveservices.azure.com",
    calls: string[] = [],
    packets: Record<string, unknown>[] = [];
  let dimensions = { width: 700, height: 700 };
  const reader = createAzureReader({
    endpoint,
    key: "synthetic_browser_key_only_for_tests",
    directory,
    grant: "offline-browser-grant",
    limit: options.limit ?? 1,
    wait: async () => {},
    fetcher: async (input, init = {}) => {
      const url = String(input);
      calls.push(`${init.method} ${url}`);
      if (init.method === "POST") {
        if (options.failure) return new Response(null, { status: 503 });
        const body = JSON.parse(String(init.body));
        expect(Object.keys(body)).toEqual(["base64Source"]);
        dimensions = validatePreparedJpeg(
          Buffer.from(body.base64Source, "base64"),
        );
        return new Response(null, {
          status: 202,
          headers: {
            "operation-location": `${endpoint}/documentintelligence/documentModels/prebuilt-receipt/analyzeResults/00000000-0000-0000-0000-000000000001?api-version=2024-11-30`,
          },
        });
      }
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      if (options.quantities)
        return new Response(
          JSON.stringify(
            azureQuantityFixture(1, dimensions.width, dimensions.height).record,
          ),
          { headers: { "content-type": "application/json" } },
        );
      const words = rows.flatMap((line, i) => {
        let x = 40;
        return line.split(" ").map((text) => {
          const width = text.length * 15,
            y = 45 + i * 70,
            polygon = [x, y, x + width, y, x + width, y + 28, x, y + 28];
          x += width + 15;
          return { content: text, confidence: 0.995, polygon };
        });
      });
      return new Response(
        JSON.stringify({
          status: "succeeded",
          analyzeResult: {
            apiVersion: "2024-11-30",
            modelId: "prebuilt-receipt",
            pages: [
              { pageNumber: 1, unit: "pixel", ...dimensions, angle: 0, words },
            ],
            documents: [
              {
                fields: {
                  Total: {
                    valueCurrency: { amount: 999999, currencyCode: "AUD" },
                  },
                },
              },
            ],
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const handler = createReceiptApi({ azureReader: reader });
  const server = createServer(
    (req, res) =>
      void handler(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.route("**/api/receipts/providers", async (route) => {
    const r = await fetch(base + "/api/receipts/providers");
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      body: await r.text(),
    });
  });
  await page.route("**/api/receipts/azure", async (route) => {
    packets.push(route.request().postDataJSON());
    const r = await fetch(base + "/api/receipts/azure", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body: route.request().postData(),
    });
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      body: await r.text(),
    });
  });
  return {
    calls,
    packets,
    async close() {
      await new Promise<void>((done, reject) => {
        server.close((e) => (e ? reject(e) : done()));
        server.closeAllConnections();
      });
      if (
        !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
        !directory.includes("gather-azure-browser-")
      )
        throw new Error("Unsafe fixture directory");
      await rm(directory, { recursive: true, force: true });
    },
  };
}
test("Azure consent, source highlights and exact split through real local HTTP with synthetic provider words", async ({
  page,
}, info) => {
  const fixture = await backend(page);
  try {
    await page.goto("/");
    await page
      .getByLabel("Upload receipt images")
      .setInputFiles(await picture(page));
    await page
      .getByRole("button", { name: "Azure receipt OCR", exact: true })
      .click();
    const scan = page.getByRole("button", {
      name: "Read receipt with Azure",
      exact: true,
    });
    await expect(scan).toBeDisabled();
    await page
      .getByRole("checkbox", { name: consentName, exact: true })
      .check();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await scan.scrollIntoViewIfNeeded();
      expect((await scan.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: await qaArtifactPath(info, `azure-consent-${width}.png`),
      });
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await scan.click();
    await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
      "5.50",
    );
    await expect(
      page.getByLabel("Item 1 line price", { exact: true }),
    ).toHaveValue("5.50");
    expect(fixture.packets).toHaveLength(1);
    expect(Object.keys(fixture.packets[0]).sort()).toEqual([
      "consent",
      "panels",
      "privacyNotice",
    ]);
    expect(fixture.packets[0]).toMatchObject({
      consent: true,
      privacyNotice: AZURE_NOTICE,
    });
    expect(fixture.calls.map((x) => x.split(" ")[0])).toEqual([
      "POST",
      "GET",
      "DELETE",
    ]);
    await page
      .getByRole("button", { name: "View source for item 1", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Receipt source for purchase 1",
      exact: true,
    });
    await expect(dialog.getByTestId("source-region").first()).toBeVisible();
    await page.screenshot({
      path: await qaArtifactPath(info, "azure-source-phone.png"),
    });
    await dialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
    const confirm = page.getByRole("button", {
      name: "Confirm receipt & add people",
    });
    await expect(confirm).toBeDisabled();
    for (const field of [
      "purchase list",
      "receipt adjustments",
      "whether item prices include tax",
    ])
      await page
        .getByRole("checkbox", {
          name: `I checked ${field} against the original`,
          exact: true,
        })
        .check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    for (const name of ["Alice", "Bob"]) {
      await page
        .getByRole("textbox", { name: "Person’s name", exact: true })
        .fill(name);
      await page
        .getByRole("button", { name: "Add person", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Let’s share it" }).click();
    await page
      .getByRole("button", { name: "Whole receipt", exact: true })
      .click();
    for (const cb of await page
      .getByTestId("whole-assignment")
      .getByRole("checkbox")
      .all())
      await cb.check();
    await page
      .getByRole("button", { name: "Finalize split", exact: true })
      .click();
    await expect(page.getByTestId("person-total-0")).toHaveText("£2.75");
    await expect(page.getByTestId("person-total-1")).toHaveText("£2.75");
  } finally {
    await fixture.close();
  }
});
test("Azure consent resets with photo order and reader changes; provider failure preserves all photos without retry", async ({
  page,
}) => {
  const fixture = await backend(page, { limit: 3, failure: true });
  try {
    await page.goto("/");
    const file = await picture(page);
    await page
      .getByLabel("Upload receipt images")
      .setInputFiles([file, { ...file, name: "footer.png" }]);
    await page
      .getByRole("button", { name: "Azure receipt OCR", exact: true })
      .click();
    const consent = page.getByRole("checkbox", {
      name: consentName,
      exact: true,
    });
    const scan = page.getByRole("button", {
      name: "Read receipt with Azure",
      exact: true,
    });
    await consent.check();
    await page
      .getByRole("button", { name: "Move image 1 later", exact: true })
      .click();
    await expect(consent).not.toBeChecked();
    await consent.check();
    await page.getByRole("button", { name: "On-device", exact: true }).click();
    await page
      .getByRole("button", { name: "Azure receipt OCR", exact: true })
      .click();
    await expect(consent).not.toBeChecked();
    await consent.check();
    await scan.click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Azure could not accept/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText: /Deletion of uploaded Azure sections could not be confirmed/,
      }),
    ).toBeVisible();
    await expect(page.locator(".selected-image")).toHaveCount(2);
    await expect(consent).not.toBeChecked();
    await expect(scan).toBeDisabled();
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.packets).toHaveLength(1);
  } finally {
    await fixture.close();
  }
});
test("Azure credentials without a section allowance stay unavailable", async ({
  page,
}) => {
  const fixture = await backend(page, { limit: 0 });
  try {
    const providers = page.waitForResponse("**/api/receipts/providers");
    await page.goto("/");
    // Absence also holds before configuration loads; wait before closing the API.
    expect(await (await providers).finished()).toBeNull();
    await expect(
      page.getByRole("button", { name: "Azure receipt OCR", exact: true }),
    ).toHaveCount(0);
    expect(fixture.calls).toEqual([]);
  } finally {
    await fixture.close();
  }
});

test("Azure source-owned quantity reaches review through real local HTTP and requires checking before splitting", async ({
  page,
}, info) => {
  const fixture = await backend(page, { quantities: true });
  try {
    await page.goto("/");
    const words = azureQuantityFixture().record.analyzeResult.pages[0].words;
    const png = await page.evaluate((words) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 700;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 700, 700);
      ctx.fillStyle = "black";
      ctx.font = "25px monospace";
      for (const word of words)
        ctx.fillText(word.content, word.polygon[0], word.polygon[1] + 25);
      return canvas.toDataURL("image/png").split(",")[1];
    }, words);
    await page.getByLabel("Upload receipt images").setInputFiles({
      name: "synthetic-azure-quantity.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await page
      .getByRole("button", { name: "Azure receipt OCR", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: consentName, exact: true })
      .check();
    await page
      .getByRole("button", { name: "Read receipt with Azure", exact: true })
      .click();
    await expect(
      page.getByLabel("Item 1 purchased quantity", { exact: true }),
    ).toHaveValue("2");
    await expect(
      page.getByLabel("Item 1 unit price (optional)", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel("Item 1 line price", { exact: true }),
    ).toHaveValue("5.00");
    await expect(page.getByLabel("Currency", { exact: true })).toHaveValue(
      "GBP",
    );
    const confirm = page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    });
    for (const field of [
      "purchase list",
      "receipt adjustments",
      "whether item prices include tax",
    ])
      await page
        .getByRole("checkbox", {
          name: `I checked ${field} against the original`,
          exact: true,
        })
        .check();
    await expect(confirm).toBeDisabled();
    await page
      .getByRole("button", { name: "View source for item 1", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Receipt source for purchase 1",
      exact: true,
    });
    await expect(dialog.getByTestId("source-region")).toHaveCount(1);
    await expect(
      dialog.getByText("Printed quantity identified by Azure: 2", {
        exact: true,
      }),
    ).toBeVisible();
    await dialog.screenshot({
      path: await qaArtifactPath(
        info,
        `azure-quantity-source-${info.project.name}.png`,
      ),
    });
    await dialog
      .getByRole("checkbox", {
        name: "I checked purchased quantity against the original",
        exact: true,
      })
      .check();
    await dialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
    await expect(confirm).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await confirm.click();
    for (const name of ["Alice", "Bob"]) {
      await page.getByRole("textbox", { name: "Person’s name" }).fill(name);
      await page
        .getByRole("button", { name: "Add person", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Let’s share it" }).click();
    await page
      .getByRole("button", { name: "Whole receipt", exact: true })
      .click();
    for (const check of await page
      .getByTestId("whole-assignment")
      .getByRole("checkbox")
      .all())
      await check.check();
    await page
      .getByRole("button", { name: "Finalize split", exact: true })
      .click();
    await expect(page.getByTestId("person-total-0")).toHaveText("£2.50");
    await expect(page.getByTestId("person-total-1")).toHaveText("£2.50");
    expect(fixture.packets).toHaveLength(1);
    expect(fixture.calls.map((call) => call.split(" ")[0])).toEqual([
      "POST",
      "GET",
      "DELETE",
    ]);
  } finally {
    await fixture.close();
  }
});
