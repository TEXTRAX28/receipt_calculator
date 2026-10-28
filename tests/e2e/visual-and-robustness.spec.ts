import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

test("capture representative screens and verify the receipt remains balanced", async ({
  page,
}, info) => {
  await mkdir("qa-artifacts", { recursive: true });
  await page.goto("/");
  await page.screenshot({
    path: `qa-artifacts/${info.project.name}-home.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try the Costco demo" }).click();
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
  for (const name of ["Alice", "Bob", "Charlie"]) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
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
  await expect(page.getByTestId("person-total-0")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-1")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-2")).toHaveText("£58.92");
  await page.locator(".person-breakdown").first().locator("summary").click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `qa-artifacts/${info.project.name}-summary.png`,
    fullPage: true,
  });
});

test("small phone and tablet portrait/landscape layouts remain usable", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Additional fixed breakpoints are exercised once.",
  );
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Upload receipt", exact: true }),
    ).toBeVisible();
  }
});

test("separate browser contexts do not see each other’s receipt data", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the Costco demo" }).click();
  const isolated = await browser.newContext();
  const other = await isolated.newPage();
  await other.goto("http://127.0.0.1:4173/");
  await expect(
    other.getByRole("heading", { name: "Big shop. Little maths." }),
  ).toBeVisible();
  expect(
    await other.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt.items
          .length,
    ),
  ).toBe(0);
  await isolated.close();
});

test("corrupted browser storage shows a recoverable state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gather.receipt.v1",
      '{"version":999,"receipt":"malformed"}',
    );
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "could not be read safely",
  );
  await expect(
    page.getByRole("button", { name: "Enter manually" }),
  ).toBeEnabled();
});

test("unavailable browser storage preserves the in-memory workflow with a warning", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("could not be saved");
  await page.getByRole("button", { name: "Enter manually" }).click();
  await expect(
    page.getByRole("textbox", { name: "Merchant", exact: true }),
  ).toBeVisible();
});

test("a second tab cannot silently overwrite an open draft", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the Costco demo" }).click();
  const other = await context.newPage();
  await other.goto("http://127.0.0.1:4173/");
  await other
    .getByRole("textbox", { name: "Merchant", exact: true })
    .fill("Other tab shop");
  await expect(page.getByRole("status").first()).toContainText(
    "stopped saving",
  );
  await page
    .getByRole("textbox", { name: "Merchant", exact: true })
    .fill("This tab shop");
  expect(
    await other.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt.merchant,
    ),
  ).toBe("Other tab shop");
  await other.close();
});

test("clipboard failure offers download recovery", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Not allowed");
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try the Costco demo" }).click();
  await page.getByRole("button", { name: "5 Summary", exact: true }).click();
  await page.getByRole("button", { name: "Copy draft", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Clipboard access is unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Download summary" }),
  ).toBeEnabled();
});
