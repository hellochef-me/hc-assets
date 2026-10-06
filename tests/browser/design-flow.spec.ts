import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../lib/fixtures";
async function setup(page: Page) {
  const data = fixtures();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/source", (r) =>
    r.fulfill({
      json: {
        kind: "demo",
        label: "Local demo",
        readOnly: false,
        aiEnabled: true,
        ocrEnabled: true,
        resaleEnabled: true,
      },
    }),
  );
  await page.route("**/api/inventory", (r) => r.fulfill({ json: data }));
  return data;
}
async function upload(page: Page, label = "DEMO-READ-42") {
  const b64 = await page.evaluate((label) => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 500;
    const x = c.getContext("2d")!;
    x.fillStyle = "#eeede9";
    x.fillRect(0, 0, 800, 500);
    x.fillStyle = "#292524";
    x.font = "38px sans-serif";
    x.fillText("FICTIONAL DEVICE LABEL", 50, 140);
    x.fillText(label, 50, 260);
    return c.toDataURL("image/png").split(",")[1];
  }, label);
  await page.getByLabel("Upload asset photos").setInputFiles({
    name: "fictional-label.png",
    mimeType: "image/png",
    buffer: Buffer.from(b64, "base64"),
  });
}
test("OCR and lookup each have a dedicated state; no form or persistence while reading", async ({
  page,
}) => {
  const data = await setup(page);
  let releaseRead!: () => void, releaseLookup!: () => void;
  const readGate = new Promise<void>((r) => (releaseRead = r)),
    lookupGate = new Promise<void>((r) => (releaseLookup = r));
  let finishedRead = false;
  await page.route("**/api/inventory", async (r) => {
    if (finishedRead) await lookupGate;
    await r.fulfill({ json: data });
  });
  await page.route("**/api/scan", async (r) => {
    await readGate;
    finishedRead = true;
    await r.fulfill({
      json: {
        brand: "Dell",
        model: "Latitude 5440",
        serial: "DEMO-READ-42",
        specs: null,
        confidence: { serial: "high" },
      },
    });
  });
  await page.goto("/scan");
  await upload(page);
  await expect(
    page.getByRole("heading", { name: "Reading the label…" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Serial number", { exact: true }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("hcassets.demo.registration.v2")!)
          .asset.photos,
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/scan-reading-390.png",
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  releaseRead();
  await expect(
    page.getByRole("heading", { name: "Checking inventory…" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Asset name", { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/scan-lookup-390.png",
    fullPage: true,
  });
  releaseLookup();
  await expect(
    page.getByRole("heading", { name: "Review the label." }),
  ).toBeVisible();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "DEMO-READ-42",
  );
});
test("cancel OCR keeps manual fields and ignores the late response", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/scan", async (r) => {
    await gate;
    await r
      .fulfill({
        json: {
          brand: "Late brand",
          model: "Late model",
          serial: "LATE-123456",
          specs: null,
          confidence: {},
        },
      })
      .catch(() => {});
  });
  await page.goto("/scan");
  await upload(page);
  await page.getByRole("button", { name: "Cancel and enter manually" }).click();
  await page.getByLabel("Serial number", { exact: true }).fill("MANUAL-123456");
  release();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "MANUAL-123456",
  );
  await expect(
    page.getByRole("heading", { name: "Review the label." }),
  ).toBeVisible();
});
test("unreadable label offers retry or manual entry without losing usable extracted details", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/scan", (r) =>
    r.fulfill({
      json: {
        brand: "Dell",
        model: "Latitude",
        serial: null,
        specs: null,
        confidence: {},
      },
    }),
  );
  await page.goto("/scan");
  await upload(page);
  await expect(
    page.getByRole("heading", { name: "We couldn’t finish this scan." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Serial number", { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/scan-unreadable-390.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await expect(page.getByLabel("Brand", { exact: true })).toHaveValue("Dell");
});
test("edit review shows before and after, keeps original identity, and writes only after confirmation", async ({
  page,
}) => {
  const data = await setup(page);
  let writes = 0;
  await page.route("**/api/assets/*", async (r) => {
    writes++;
    const b = r.request().postDataJSON();
    expect(b.expectedVersion).toBe(data.assets[0].version);
    Object.assign(data.assets[0], b.asset, {
      version: data.assets[0].version + 1,
    });
    await r.fulfill({ json: { asset: data.assets[0] } });
  });
  await page.goto("/assets/" + data.assets[0].id);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Updated fictional laptop");
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  expect(writes).toBe(0);
  await expect(
    page.getByRole("dialog", { name: "Review changes" }),
  ).toBeVisible();
  await expect(page.locator(".change-row")).toContainText(
    "Updated fictional laptop",
  );
  await expect(page.locator(".edit-review .record-kept")).toContainText(
    data.assets[0].id,
  );
  await page.screenshot({
    path: "docs/screenshots/edit-review-390.png",
    fullPage: false,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Back to edit" }).click();
  await expect(page.getByLabel("Asset name", { exact: true })).toHaveValue(
    "Updated fictional laptop",
  );
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(writes).toBe(1);
});

test("edit label rescan requires explicit serial adoption and physical checking before review", async ({
  page,
}) => {
  const data = await setup(page);
  let writes = 0;
  await page.route("**/api/assets/*", (r) => {
    writes++;
    return r.fulfill({
      status: 409,
      json: {
        error: "That serial belongs to an existing asset.",
        assetId: "DEMO-002",
      },
    });
  });
  await page.route("**/api/scan", (r) =>
    r.fulfill({
      json: {
        brand: "Other",
        model: "Other",
        serial: "CORRECTED-42",
        specs: null,
        confidence: { serial: "high" },
      },
    }),
  );
  await page.goto("/assets/" + data.assets[0].id);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  const original = await page
    .getByLabel("Serial number", { exact: true })
    .inputValue();
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload correction label").setInputFiles({
    name: "correction.png",
    mimeType: "image/png",
    buffer: Buffer.from(b64, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Use this serial" }),
  ).toBeVisible();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    original,
  );
  await page.getByRole("button", { name: "Use this serial" }).click();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "CORRECTED-42",
  );
  await expect(page.getByLabel("I checked this serial")).not.toBeChecked();
  await page.getByLabel("I checked this serial").check();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit asset" })).toBeVisible();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "CORRECTED-42",
  );
  await expect(
    page.getByRole("link", { name: "Open matching asset" }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
