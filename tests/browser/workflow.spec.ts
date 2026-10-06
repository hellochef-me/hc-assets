import { test, expect, Page } from "@playwright/test";
import { fixtures } from "../../lib/fixtures";
async function setup(page: Page, serial: string) {
  const snapshot = fixtures();
  snapshot.assets[0].serial = "QY8C7K1QR9";
  let creates = 0;
  await page.route("**/api/source", (r) =>
    r.fulfill({
      json: {
        kind: "demo",
        readOnly: false,
        aiEnabled: true,
        ocrEnabled: true,
        label: "Demo",
      },
    }),
  );
  await page.route("**/api/inventory", (r) => {
    if (r.request().method() === "POST") {
      creates++;
      return r.fulfill({
        status: 409,
        json: {
          code: "duplicate",
          assetId: "DEMO-001",
          error: "Already exists",
        },
      });
    }
    return r.fulfill({ json: snapshot });
  });
  await page.route("**/api/scan", (r) =>
    r.fulfill({
      json: {
        brand: "Apple",
        model: "MacBook Pro",
        serial,
        specs: null,
        confidence: { serial: "high" },
      },
    }),
  );
  return { snapshot, creates: () => creates };
}
async function upload(page: Page) {
  await page.goto("/scan");
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    return c.toDataURL("image/png").split(",")[1];
  });
  const png = Buffer.from(data, "base64");
  await page
    .getByLabel("Upload asset photos")
    .setInputFiles({ name: "label.png", mimeType: "image/png", buffer: png });
}
test("exact OCR match opens the existing asset without a registration submission", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, "qy8c7k1qr9");
  await upload(page);
  await expect(
    page.getByRole("heading", { name: "This device is already registered." }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/serial-exact-match-390.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /Open existing asset/ }).click();
  await expect(page).toHaveURL(/assets\/DEMO-001/);
  expect(state.creates()).toBe(0);
  await page.goto("/scan");
  await expect(
    page.getByRole("heading", { name: "Scan a label" }),
  ).toBeVisible();
});
test("missing OCR character requires comparison before proceeding and opens existing without saving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, "QYC7K1QR9");
  await upload(page);
  await expect(
    page.getByRole("heading", { name: "Could this be the same device?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue as new device", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Serial number", { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/serial-possible-match-390.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /QY8C7K1QR9/ }).click();
  await expect(page).toHaveURL(/assets\/DEMO-001/);
  expect(state.creates()).toBe(0);
});
test("distinct-device override is explicit and resets when starting a new scan", async ({
  page,
}) => {
  await setup(page, "QYC7K1QR9");
  await upload(page);
  await page.getByLabel("I compared these records").check();
  await page
    .getByRole("button", { name: "Continue as new device", exact: true })
    .click();
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to register." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start a new scan" }).click();
  await page.getByRole("button", { name: /Enter manually/ }).click();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("heading", { name: "Could this be the same device?" }),
  ).not.toBeVisible();
});
test("race-time exact duplicate redirects to existing asset instead of leaving a failed registration", async ({
  page,
}) => {
  const state = await setup(page, "UNIQUE9X");
  await page.goto("/scan?manual=1");
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Fictional race laptop");
  await page.getByLabel("Serial number", { exact: true }).fill("UNIQUE9X");
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(page).toHaveURL(/assets\/DEMO-001/);
  expect(state.creates()).toBe(1);
});
test("registration assigns an owner atomically and details/edit support reassignment without re-registration", async ({
  page,
  request,
}) => {
  const serial = "OWNER-" + crypto.randomUUID().slice(0, 12);
  await page.goto("/scan?manual=1");
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Fictional owner workflow");
  await page.getByLabel("Serial number", { exact: true }).fill(serial);
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("combobox", { name: "Assign to", exact: true }).click();
  await page.getByRole("option", { name: "Nora Ellis", exact: true }).click();
  await page.getByRole("combobox", { name: "Location", exact: true }).click();
  await page
    .getByRole("option", {
      name: "No storage location — with assignee",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.locator(".confirmation")).toContainText("Nora Ellis");
  await page.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(page).toHaveURL(/assets\/DEMO-/);
  const id = page.url().split("/assets/")[1].split("?")[0];
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reassign owner", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Assign to", exact: true }).click();
  await page.getByRole("option", { name: "Maya Chen", exact: true }).click();
  await page
    .getByRole("button", { name: /Confirm (movement|assignment|reassignment)/ })
    .click();
  await expect(page.locator(".overview-ownership")).toContainText("Maya Chen");
  await page.goto("/scan?manual=1");
  await page.getByLabel("Serial number", { exact: true }).fill(serial);
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("link", { name: /Open existing asset/ }).click();
  await expect(page).toHaveURL(new RegExp(id));
  const snapshot = await (await request.get("/api/inventory")).json();
  expect(
    snapshot.assets.filter((a: { serial: string }) => a.serial === serial),
  ).toHaveLength(1);
  expect(
    snapshot.history
      .filter((e: { assetId: string }) => e.assetId === id)
      .map((e: { action: string }) => e.action),
  ).toEqual(["Transfer", "Created"]);
});

test("archived duplicate links open the canonical record and retain its combined history", async ({
  page,
}) => {
  const state = await setup(page, "");
  const snapshot = {
    ...state.snapshot,
    aliases: { "ARCHIVED-ID": "DEMO-001" },
  };
  snapshot.assets[0].mergedFromIds = ["ARCHIVED-ID"];
  snapshot.history.push({
    id: "merged-history",
    assetId: "ARCHIVED-ID",
    action: "Created",
    actor: "Fixture operator",
    at: new Date().toISOString(),
    from: { assignee: "", location: "", status: "" },
    to: { assignee: "", location: "Locker", status: "Needs review" },
    notes: "Preserved duplicate history",
  });
  await page.route("**/api/inventory", (r) => r.fulfill({ json: snapshot }));
  await page.goto("/assets/ARCHIVED-ID");
  await expect(page).toHaveURL(/assets\/DEMO-001/);
  await expect(page.getByText("Preserved duplicate history")).toBeVisible();
});
