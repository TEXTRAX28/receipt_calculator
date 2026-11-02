import { test, expect } from "@playwright/test";
import { qaArtifactPath } from "./qa-artifacts";

async function upload(page: import("@playwright/test").Page, tall = false) {
  await page.goto("/");
  const data = await page.evaluate((tall) => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = tall ? 4400 : 1000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    ctx.font = "bold 32px monospace";
    ctx.fillText("LITTLE MARKET", 45, 80);
    ctx.fillText("Currency GBP", 45, 125);
    const count = tall ? 40 : 2;
    for (let i = 0; i < count; i++)
      ctx.fillText(
        `${i < 2 ? "Milk" : i === count - 1 ? "Bread" : `Item${String(i + 1).padStart(2, "0")}`} 1x 1.00 1.00`,
        45,
        180 + i * (tall ? 90 : 150),
      );
    ctx.fillText(`TOTAL GBP ${count}.00`, 45, canvas.height - 110);
    ctx.fillText("PRICES INCLUDE TAX", 45, canvas.height - 55);
    return canvas.toDataURL("image/png").split(",")[1];
  }, tall);
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-source.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
}

test("actual on-device word evidence highlights separate identical purchases", async ({
  page,
}, info) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await upload(page);
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "2.00",
    { timeout: 130000 },
  );
  const positions = [];
  for (const item of [1, 2]) {
    await expect(
      page.getByLabel(`Item ${item} description`, { exact: true }),
    ).toHaveValue("Milk");
    await page
      .getByRole("button", {
        name: `View source for item ${item}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("source-region")).toHaveCount(1);
    const region = dialog.getByTestId("source-region");
    positions.push(Number(await region.getAttribute("y")));
    await expect(
      dialog.getByRole("img", {
        name: "Highlighted receipt area in photo 1, section 1",
        exact: true,
      }),
    ).toBeVisible();
    if (item === 1)
      await dialog.screenshot({
        path: await qaArtifactPath(info, "device-native-source.png"),
      });
    await dialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
  }
  expect(positions[1]).toBeGreaterThan(positions[0]);
  expect(posts).toEqual([]);
});

test("native tall-receipt source evidence reaches the last reading section", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await upload(page, true);
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "40.00",
    { timeout: 130000 },
  );
  await expect(
    page.getByRole("textbox", { name: /^Item \d+ description$/ }),
  ).toHaveCount(40);
  for (const item of [1, 2])
    await expect(
      page.getByLabel(`Item ${item} description`, { exact: true }),
    ).toHaveValue("Milk");
  await expect(
    page.getByRole("checkbox", {
      name: "I checked purchase list against the original",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  ).toBeDisabled();
  for (const [item, section] of [
    [1, /section 1$/],
    [40, /section [2-9]\d*$/],
  ] as const) {
    await page
      .getByRole("button", {
        name: `View source for item ${item}`,
        exact: true,
      })
      .click();
    const image = page
      .getByRole("dialog")
      .getByRole("img", { name: /Highlighted receipt area/ });
    await expect(image).toHaveAttribute("aria-label", section);
    await expect(
      page.getByRole("dialog").getByTestId("source-region").first(),
    ).toBeVisible();
    if (item === 40)
      await page.getByRole("dialog").screenshot({
        path: await qaArtifactPath(info, "device-native-footer-source.png"),
      });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
  }
});
