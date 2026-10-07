import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../lib/fixtures";
for (const width of [390, 1280])
  test(`label OCR evidence and explicit device thumbnail stay separate at ${width}px`, async ({
    page,
  }) => {
    await page.route("**/api/source", (r) =>
      r.fulfill({
        json: {
          kind: "demo",
          label: "Local demo",
          readOnly: false,
          aiEnabled: false,
          checkedAt: null,
        },
      }),
    );
    await page.route("**/api/inventory", (r) =>
      r.fulfill({ json: fixtures() }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/scan");
    const image = async (color: string, text: string) =>
      Buffer.from(
        await page.evaluate(
          ({ color, text }) => {
            const c = document.createElement("canvas");
            c.width = 240;
            c.height = 160;
            const ctx = c.getContext("2d")!;
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 240, 160);
            ctx.fillStyle = "white";
            ctx.font = "16px sans-serif";
            ctx.fillText(text, 15, 80);
            return c.toDataURL("image/png").split(",")[1];
          },
          { color, text },
        ),
        "base64",
      );
    await page.getByLabel("Upload asset photos").setInputFiles({
      name: "fictional-label.png",
      mimeType: "image/png",
      buffer: await image("#555", "SERIAL TEST-123"),
    });
    await expect(
      page.getByRole("heading", { name: "Check the device" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("hcassets.demo.registration.v2")!)
            .asset.photos,
      ),
    ).toEqual([]);
    await page
      .getByLabel("Asset name", { exact: true })
      .fill("Fictional device");
    await page.getByLabel("Serial number", { exact: true }).fill("PHOTO-123");

    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const card = page.getByRole("region", { name: "Device thumbnail" });
    await expect(card.locator(".device img")).toHaveCount(0);
    await expect(
      card.getByText("No device photo yet.", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/device-photo-empty-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel("Upload device thumbnail").setInputFiles({
      name: "fictional-device.png",
      mimeType: "image/png",
      buffer: await image("#17634F", "DEVICE PHOTO"),
    });
    await expect(card.locator(".device img")).toBeVisible();
    await expect(card.locator(".device img")).toHaveCSS(
      "object-fit",
      "contain",
    );
    await expect(card.getByAltText("Inventory thumbnail preview")).toHaveCSS(
      "object-fit",
      "contain",
    );
    const draft = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("hcassets.demo.registration.v2")!)
          .asset,
    );
    expect(draft.coverPhotoIndex).toBe(0);
    expect(await card.locator(".device img").getAttribute("src")).toBe(
      draft.photos[0],
    );
    await page.reload();
    await expect(card.locator(".device img")).toBeVisible();
    await page
      .getByRole("button", { name: "Back to details", exact: true })
      .click();
    await expect(
      page.getByText("No label photo retained", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(card.locator(".device img")).toBeVisible();
    const retained = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("hcassets.demo.registration.v2")!)
          .asset,
    );
    expect(retained.coverPhotoIndex).toBe(0);
    expect(retained.photos.length).toBe(1);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/device-thumbnail-${width}.png`,
      fullPage: true,
    });
    await card.getByRole("button", { name: "Remove device photo" }).click();
    await expect(card.locator(".device img")).toHaveCount(0);
  });
test("adding a device photo while editing does not submit until Save changes, and cover identity survives the confirmed save", async ({
  page,
}) => {
  const data = fixtures();
  let writes = 0;
  let savedCover: number | null | undefined;
  await page.route("**/api/source", (r) =>
    r.fulfill({
      json: {
        kind: "demo",
        label: "Local demo",
        readOnly: false,
        aiEnabled: false,
        checkedAt: null,
      },
    }),
  );
  await page.route("**/api/inventory", (r) => r.fulfill({ json: data }));
  await page.route("**/api/assets/*", async (r) => {
    writes++;
    const body = r.request().postDataJSON();
    savedCover = body.asset.coverPhotoIndex;
    Object.assign(data.assets[0], body.asset, { version: 2 });
    await r.fulfill({ json: { asset: data.assets[0] } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/assets/" + data.assets[0].id);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page
    .getByRole("button", { name: "Take device photo", exact: true })
    .click();
  const camera = page.locator("dialog.camera-modal");
  await expect(camera).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Capture photo", exact: true }),
  ).toBeVisible();
  const guide = await camera.locator(".camera-guides").boundingBox();
  const sensor = await camera
    .locator("video")
    .evaluate((v: HTMLVideoElement) => ({
      width: v.videoWidth,
      height: v.videoHeight,
    }));
  expect(guide!.width / guide!.height).toBeCloseTo(
    sensor.width / sensor.height,
    2,
  );
  const bounds = await camera.boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await expect(camera.getByRole("button")).toHaveCount(3);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/device-camera-fullscreen-390.png",
  });
  // Escape closes the camera, preserving the underlying asset editor.
  await page.keyboard.press("Escape");
  await expect(camera).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Take device photo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(camera.getByRole("button")).toHaveCount(3);
  await expect(
    camera.getByRole("button", { name: "Upload photo instead" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/device-camera-review-390.png",
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(camera).toHaveJSProperty("scrollHeight", 390);
  await expect(
    camera.getByRole("button", { name: "Use photo", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Use photo", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(writes).toBe(0);
  await expect(
    page
      .getByRole("region", { name: "Device thumbnail" })
      .locator(".device img"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(writes).toBe(1);
  expect(savedCover).toBe(0);
});
