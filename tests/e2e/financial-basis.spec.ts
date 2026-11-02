import { expect, test } from "@playwright/test";
import { qaArtifactPath } from "./qa-artifacts";

for (const scenario of ["basis", "roles", "payments"] as const)
  test(`${scenario === "basis" ? "net-price interpretation" : scenario === "roles" ? "fee/tax role proposals" : "payment-row exclusions"} stays blocked until checked against its printed summary (synthetic protocol)`, async ({
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
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST")
        posts.push(new URL(request.url()).pathname);
    });
    await page.route("**/api/receipts/providers", (route) =>
      route.fulfill({
        json: {
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
                words: sourceLines,
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
            pricesIncludeTax: scenario !== "basis" ? false : null,
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
              ...(scenario === "roles"
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
    const fixture = await page.evaluate((texts) => {
      const canvas = document.createElement("canvas");
      canvas.width = 700;
      canvas.height = 1400;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 700, 1400);
      ctx.fillStyle = "black";
      ctx.font = "22px monospace";
      ctx.fillText("SYNTHETIC FINANCIAL SUMMARY", 40, 40);
      const lines = texts.map((text, index) => {
        const y = 130 + index * 140;
        ctx.fillText(text, 60, y);
        return {
          text,
          confidence: 0.99,
          box: [
            58 / 700,
            (y - 24) / 1400,
            (64 + ctx.measureText(text).width) / 700,
            (y + 6) / 1400,
          ],
        };
      });
      return { png: canvas.toDataURL("image/png").split(",")[1], lines };
    }, rows);
    sourceLines = fixture.lines;
    await page.getByLabel("Upload receipt images").setInputFiles({
      name: "synthetic-net-prices.png",
      mimeType: "image/png",
      buffer: Buffer.from(fixture.png, "base64"),
    });
    await page
      .getByLabel("Local vision comparison", { exact: true })
      .selectOption("always");
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
    await expect(confirm).toBeDisabled();
    const fields =
      scenario === "roles"
        ? [
            "receipt adjustments",
            "printed tax",
            "whether item prices include tax",
          ]
        : scenario === "payments"
          ? ["receipt adjustments"]
          : ["whether item prices include tax"];
    for (const field of fields) {
      await page
        .getByRole("button", { name: `View source for ${field}`, exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: `Receipt source for ${field}`,
        exact: true,
      });
      await expect(dialog.getByTestId("source-region")).toHaveCount(4);
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
      if (scenario === "basis")
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
    await expect(confirm).toBeEnabled();
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
  });
