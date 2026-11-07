import { expectReviewBlocked, expectReviewReady } from "./review-assertions";
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { qaArtifactPath } from "./qa-artifacts";
import { slantedSummary } from "../fixtures/financial-columns";

for (const scenario of [
  "basis",
  "roles",
  "payments",
  "split-total",
  "split-tax",
  "slanted-columns",
] as const)
  test(`${scenario === "basis" ? "net-price interpretation" : scenario === "roles" ? "fee/tax role proposals" : scenario === "payments" ? "payment-row exclusions" : scenario + " fragment association"} stays blocked until checked against its printed summary (synthetic protocol)`, async ({
    page,
    browser,
  }, info) => {
    const rows = [
      "Little Market",
      "Currency GBP",
      "Meal 1 x 18.00 18.00",
      "Subtotal 18.00",
      "Service charge 1.00",
      "Tax 2.00",
      "Total 21.00",
      ...(scenario === "payments"
        ? ["Cash 30.00", "Change 9.00", "Prices exclude tax"]
        : []),
    ];
    let originalPanels: unknown;
    let sourceLines: { text: string; confidence: number; box: number[] }[] = [];
    let sourceWords: typeof sourceLines;
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST")
        posts.push(new URL(request.url()).pathname);
    });
    await page.route("**/api/receipts/providers", (route) =>
      route.fulfill({
        json: {
          assistedReader: "computer",
          localCheckMode: "always",
          localModel: { configured: true, name: "PaddleOCR" },
          localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
        },
      }),
    );
    await page.route("**/api/receipts/recognize", (route) => {
      const body = route.request().postDataJSON();
      originalPanels = body.panels;
      return route.fulfill({
        json: {
          recognition: {
            engine: "paddle-ppocrv6-medium-onnx",
            panels: body.panels.map(
              ({ photo, part }: { photo: number; part: number }) => ({
                photo,
                part,
                width: 700,
                height: 1400,
                lines: sourceLines,
                words: sourceWords,
              }),
            ),
          },
        },
      });
    });
    await page.route("**/api/receipts/vision", (route) => {
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(["panels"]);
      expect(body.panels).toEqual(originalPanels);
      return route.fulfill({
        json: {
          receipt: {
            merchant: "Little Market",
            date: "",
            currency: "GBP",
            subtotal: "18.00",
            printedTotal: "21.00",
            printedTax: scenario === "roles" ? "1.00" : "2.00",
            pricesIncludeTax:
              scenario === "roles" || scenario === "payments" ? false : null,
            printedItemCount: null,
            taxCodes: [],
            warnings: [],
            items: [
              {
                description: "Meal",
                quantity: "1",
                unitPrice: "18.00",
                lineTotal: "18.00",
                discount: "0",
                taxCode: "",
                note: "",
                sourcePhotos: [1],
              },
            ],
            adjustments: [
              ...(scenario === "slanted-columns"
                ? [
                    { label: "PB1", kind: "discount", amount: "2.00" },
                    { label: "SVC CHRG", kind: "fee", amount: "1.00" },
                  ]
                : scenario === "roles"
                  ? [
                      {
                        label: "Service charge",
                        kind: "discount",
                        amount: "1.00",
                      },
                      { label: "Tax", kind: "fee", amount: "2.00" },
                    ]
                  : [{ label: "Service charge", kind: "fee", amount: "1.00" }]),
              ...(scenario === "payments"
                ? [
                    { label: "Cash", kind: "tip", amount: "30.00" },
                    { label: "Change", kind: "fee", amount: "9.00" },
                  ]
                : []),
            ],
          },
        },
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", {
        name: "Assisted scan · This computer",
        exact: true,
      })
      .click();
    const fixture = await page.evaluate(
      ({ texts, splitRow, slanted }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 700;
        canvas.height = 1400;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 700, 1400);
        ctx.fillStyle = "black";
        ctx.font = "22px monospace";
        ctx.fillText("SYNTHETIC FINANCIAL SUMMARY", 40, 40);
        if (slanted) {
          for (const word of slanted.words) {
            const [left, top, right, bottom] = word.box;
            ctx.font = `${Math.min(24, (bottom - top) * 1400 * 0.7)}px monospace`;
            ctx.fillText(
              word.text,
              left * 700,
              bottom * 1400 - 3,
              (right - left) * 700,
            );
          }
          return {
            png: canvas.toDataURL("image/png").split(",")[1],
            lines: slanted.sourceLines,
            words: slanted.words,
          };
        }
        const lines = texts.flatMap((text, index) => {
          const y = 130 + index * 140;
          ctx.fillText(text, 60, y);
          const original = {
            text,
            confidence: 0.99,
            box: [
              58 / 700,
              (y - 24) / 1400,
              (64 + ctx.measureText(text).width) / 700,
              (y + 6) / 1400,
            ],
          };
          if (index !== splitRow) return [original];
          const boundary = text.lastIndexOf(" ");
          const label = text.slice(0, boundary),
            amount = text.slice(boundary + 1);
          return [
            {
              ...original,
              text: amount,
              box: [
                (60 + ctx.measureText(label + " ").width - 2) / 700,
                original.box[1],
                original.box[2],
                original.box[3],
              ],
            },
            {
              ...original,
              text: label,
              box: [
                original.box[0],
                original.box[1],
                (64 + ctx.measureText(label).width) / 700,
                original.box[3],
              ],
            },
          ];
        });
        return {
          png: canvas.toDataURL("image/png").split(",")[1],
          lines,
          words: lines,
        };
      },
      {
        texts: rows,
        splitRow:
          scenario === "split-total" ? 6 : scenario === "split-tax" ? 5 : -1,
        slanted: scenario === "slanted-columns" ? slantedSummary() : null,
      },
    );
    sourceLines = fixture.lines;
    sourceWords = fixture.words;
    await page.getByLabel("Upload receipt images").setInputFiles({
      name: "synthetic-net-prices.png",
      mimeType: "image/png",
      buffer: Buffer.from(fixture.png, "base64"),
    });

    await page
      .getByRole("button", {
        name: "Read receipt on this computer",
        exact: true,
      })
      .click();
    const confirm = page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    });
    await expectReviewBlocked(page, confirm);
    const fields =
      scenario === "roles"
        ? [
            "receipt adjustments",
            "printed tax",
            "whether item prices include tax",
          ]
        : scenario === "payments"
          ? ["receipt adjustments"]
          : [
              "whether item prices include tax",
              ...(scenario === "slanted-columns"
                ? ["printed tax", "receipt adjustments"]
                : scenario === "split-total"
                  ? ["printed total"]
                  : scenario === "split-tax"
                    ? ["printed tax", "receipt adjustments"]
                    : []),
            ];
    for (const field of fields) {
      await expectReviewBlocked(page, confirm);
      await page
        .getByRole("button", { name: `View source for ${field}`, exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: `Receipt source for ${field}`,
        exact: true,
      });
      await expect(dialog.getByTestId("source-region")).toHaveCount(
        scenario === "slanted-columns"
          ? field === "printed tax"
            ? 3
            : 5
          : scenario.startsWith("split-")
            ? field === "whether item prices include tax" ||
              field === "receipt adjustments"
              ? 5
              : 2
            : 4,
      );
      if (scenario === "payments" && field === "receipt adjustments") {
        await expect(
          dialog.getByText("Payment row: Cash: 30.00", { exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByText("Payment row: Change: 9.00", { exact: true }),
        ).toBeVisible();
      }
      if (scenario === "roles" && field === "receipt adjustments") {
        await expect(
          dialog.getByText("Printed Service charge (fee): 1.00", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByText("Previous Service charge (discount): 1.00", {
            exact: true,
          }),
        ).toBeVisible();
      }
      if (scenario === "slanted-columns" && field === "receipt adjustments") {
        await expect(
          dialog.getByText("Printed PB1 (tax): 2.00", { exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByText("Previous PB1 (discount): 2.00", { exact: true }),
        ).toBeVisible();
      }
      if (
        field === "whether item prices include tax" &&
        (scenario === "basis" ||
          scenario.startsWith("split-") ||
          scenario === "slanted-columns")
      )
        await expect(
          dialog.getByText("Previous vision tax basis: Unknown", {
            exact: true,
          }),
        ).toBeVisible();
      await dialog.screenshot({
        path: await qaArtifactPath(
          info,
          `financial-${scenario}-${field.replaceAll(" ", "-")}.png`,
        ),
      });
      await dialog
        .getByRole("checkbox", {
          name: `I checked ${field} against the original`,
          exact: true,
        })
        .check();
      await dialog
        .getByRole("button", { name: "Back to receipt", exact: true })
        .click();
    }
    if (scenario === "slanted-columns") {
      // DUE is not supported by the primary total parser. Financial role
      // recovery must not silently confirm the separate model total.
      await expectReviewBlocked(page, confirm);
      await expect(
        page.getByLabel("Printed total", { exact: true }),
      ).toHaveValue("21.00");
      await page
        .getByRole("checkbox", {
          name: "I checked printed total against the original",
          exact: true,
        })
        .check();
    }
    await info.attach("Financial source protocol runtime", {
      body: Buffer.from(
        JSON.stringify({
          browser_version: browser.version(),
          project: info.project.name,
          scenario,
          synthetic_fixture: true,
          real_model_calls: 0,
        }),
      ),
      contentType: "application/json",
    });
    await expectReviewReady(page, confirm);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: await qaArtifactPath(info, `financial-${scenario}-review.png`),
      fullPage: true,
    });
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
    for (const checkbox of await page
      .getByTestId("whole-assignment")
      .getByRole("checkbox")
      .all())
      await checkbox.check();
    await page
      .getByRole("button", { name: "Finalize split", exact: true })
      .click();
    await expect(page.getByTestId("person-total-0")).toHaveText("£10.50");
    await expect(page.getByTestId("person-total-1")).toHaveText("£10.50");
    expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
    await writeFile(
      await qaArtifactPath(info, `financial-${scenario}-evidence.json`),
      JSON.stringify(
        {
          scenario,
          scope:
            "Synthetic primary and vision responses; real drawn source regions, mandatory review and exact UI splitting. No real provider inference or independent human verification.",
          sourceLines,
          sourceWords,
          posts,
          realModelCalls: 0,
          state: await page.evaluate(() =>
            JSON.parse(localStorage.getItem("gather.receipt.v1")!),
          ),
          displayedShares: [
            await page.getByTestId("person-total-0").innerText(),
            await page.getByTestId("person-total-1").innerText(),
          ],
        },
        null,
        2,
      ),
    );
  });
