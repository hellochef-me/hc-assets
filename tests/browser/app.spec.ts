import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../lib/fixtures";
import { blankAsset, Asset, AssetInput } from "../../lib/model";
async function mock(
  page: Page,
  options: { legacyDuplicate?: boolean; failSave?: boolean } = {},
) {
  const snapshot = fixtures();
  if (options.legacyDuplicate)
    snapshot.assets.push({ ...snapshot.assets[0], id: "DEMO-LEGACY-DUP" });
  let failed = false;
  let creates = 0;
  const receipts = new Map<string, Asset>();
  await page.route("**/api/inventory", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: snapshot });
      return;
    }
    creates++;
    const { asset, requestId } = route.request().postDataJSON() as {
      asset: AssetInput;
      requestId: string;
    };
    const previous = receipts.get(requestId);
    const saved = previous || {
      ...asset,
      id: `DEMO-BROWSER-${creates}`,
      status: "Needs review" as const,
      assignee: "",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!previous) {
      snapshot.assets.unshift(saved);
      receipts.set(requestId, saved);
    }
    if (options.failSave && !failed) {
      failed = true;
      await route.abort("failed");
      return;
    }
    await route.fulfill({ status: 201, json: { asset: saved } });
  });
  return {
    snapshot,
    receipts,
    get creates() {
      return creates;
    },
  };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
async function newIntake(page: Page, serial: string) {
  await page.goto("/scan?manual=1");
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Fictional test laptop");
  await page.getByLabel("Serial number", { exact: true }).fill(serial);
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to register." }),
  ).toBeVisible();
}
test("real local API reads fixtures, blocks external origins and disables paid providers", async ({
  request,
}) => {
  const r = await request.get("/api/inventory");
  expect(r.status()).toBe(200);
  expect((await r.json()).assets.some((a: Asset) => a.id === "DEMO-001")).toBe(
    true,
  );
  expect((await request.post("/api/scan", { data: {} })).status()).toBe(503);
  expect((await request.post("/api/resale", { data: {} })).status()).toBe(503);
  expect(
    (
      await request.post("/api/inventory", {
        headers: { origin: "https://public.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
test("real local API confirms create and idempotent retry", async ({
  request,
}) => {
  const input = {
    asset: {
      ...blankAsset(),
      name: "Browser API fixture",
      serial: `BROWSER-API-${Date.now()}`,
      serialChecked: true,
    },
    requestId: crypto.randomUUID(),
  };
  const first = await request.post("/api/inventory", { data: input });
  expect(first.status()).toBe(201);
  const a = await first.json();
  const retry = await request.post("/api/inventory", { data: input });
  expect(await retry.json()).toEqual(a);
  const duplicate = await request.post("/api/inventory", {
    data: { ...input, requestId: crypto.randomUUID() },
  });
  expect(duplicate.status()).toBe(409);
});
for (const width of [320, 360, 390, 430, 768, 1280, 1440])
  test(`responsive inventory, detail, scan at ${width}px`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Inventory", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("7 demo assets across your workplace"),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: `docs/screenshots/inventory-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.goto("/assets/DEMO-001");
    await expect(
      page.getByRole("heading", { name: "MacBook Pro 14", exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `docs/screenshots/detail-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    await page.goto("/scan");
    await expect(
      page.getByRole("heading", { name: "Start with the label." }),
    ).toBeVisible();
    await noOverflow(page);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `docs/screenshots/capture-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    await page.getByRole("button", { name: "Register new sample" }).click();
    await page.getByLabel("I checked this serial").check();
    await noOverflow(page);
    if (width === 390)
      await page.screenshot({
        path: "docs/screenshots/review-390.png",
        fullPage: true,
        animations: "disabled",
      });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ready to register." }),
    ).toBeVisible();
    await noOverflow(page);
    if (width === 390)
      await page.screenshot({
        path: "docs/screenshots/confirm-390.png",
        fullPage: true,
        animations: "disabled",
      });
    expect(errors).toEqual([]);
  });
test("scan existing serial with case/outer spaces opens record directly, then edit", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/scan?manual=1");
  await page
    .getByLabel("Serial number", { exact: true })
    .fill("  demo-c02x148  ");
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/assets\/DEMO-001/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit asset" })).toBeVisible();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "DEMO-C02X148",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("legacy duplicate identity requires record choice and does not merge", async ({
  page,
}) => {
  await mock(page, { legacyDuplicate: true });
  await page.goto("/scan");
  await page.getByRole("button", { name: "Find existing sample" }).click();
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose an existing record" }),
  ).toBeVisible();
  await expect(
    page.getByText("Multiple existing records have this serial.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".duplicate-record")).toHaveCount(2);
});
test("interrupted save retries same request, back and refresh preserve draft", async ({
  page,
}) => {
  const state = await mock(page, { failSave: true });
  await newIntake(page, "DEMO-RETRY");
  await page.getByRole("button", { name: "Back to review" }).click();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "DEMO-RETRY",
  );
  await page.reload();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "DEMO-RETRY",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(
    page.getByText("Connection interrupted.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(page).toHaveURL(/assets\/DEMO-BROWSER/);
  expect(state.receipts.size).toBe(1);
  expect(state.creates).toBe(2);
});
test("empty, failed loading and retry states", async ({ page }) => {
  let fail = true;
  await page.route("**/api/inventory", (r) =>
    r.fulfill(
      fail
        ? { status: 503, json: { error: "Demo network unavailable" } }
        : { json: fixtures() },
    ),
  );
  await page.goto("/");
  await expect(page.getByText("Demo network unavailable")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry inventory" }).click();
  await page
    .getByLabel("Search assets, serials or people")
    .fill("nothing-matches");
  await expect(
    page.getByRole("heading", { name: "No assets found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByText("Showing 7 of 7 demo assets")).toBeVisible();
});
test("filters, preview and keyboard navigation", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByText("Showing 7 of 7 demo assets")).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(
    page.getByLabel("Search assets, serials or people"),
  ).toBeFocused();
  await page.getByLabel("Search assets, serials or people").fill("latitude");
  await expect(page.getByText("Showing 1 of 7 demo assets")).toBeVisible();
  await page
    .getByRole("button", { name: "Preview Dell Latitude 5440" })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Asset preview" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/inventory-preview-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByLabel("Category filter").selectOption("Monitor");
  await expect(page.getByText("Showing 1 of 7 demo assets")).toBeVisible();
});
test("photo preparation, invalid format and cancellation retain manual path", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scan");
  await page.getByLabel("Upload asset photos").setInputFiles({
    name: "invalid.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("fake"),
  });
  await expect(
    page.getByText("Choose a JPG, PNG or WebP photo.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Enter.*manually/ }).click();
  await expect(page.getByLabel("Asset name", { exact: true })).toBeVisible();
});
test("accessibility on mobile inventory, capture, review, detail and dialog", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/scan", "/scan?manual=1", "/assets/DEMO-001"]) {
    await page.goto(route);
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  }
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual(
    [],
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeFocused();
});
test("long serial, orientation and reduced motion", async ({ page }) => {
  await mock(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 800 });
  await newIntake(page, "LONG-DEMO-" + "ABCDEFGHIJ".repeat(20));
  await noOverflow(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await noOverflow(page);
  expect(
    await page
      .locator(".confirm-stage")
      .evaluate((e) => getComputedStyle(e).animationDuration),
  ).toBe("0.08s");
});
test("unknown serial is explicit and lookup preserves meaningful internal characters", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/scan?manual=1");
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Unknown label demo");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Confirm the serial is unknown,", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Serial is missing or unreadable").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to register." }),
  ).toBeVisible();
  await expect(page.locator(".confirmation")).toContainText("Unknown");
});
test("edit collision keeps editable draft", async ({ page }) => {
  await mock(page);
  await page.route("**/api/assets/DEMO-002", (r) =>
    r.fulfill({
      status: 409,
      json: {
        error:
          "That serial number belongs to an existing asset. Open it instead.",
        assetId: "DEMO-001",
      },
    }),
  );
  await page.goto("/assets/DEMO-002");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Serial number", { exact: true }).fill("DEMO-C02X148");
  await page.getByLabel("I checked this serial").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open matching asset" }),
  ).toBeVisible();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "DEMO-C02X148",
  );
});
test("movement remains pending until confirmed, updates actor/from/to history", async ({
  page,
}) => {
  const state = await mock(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/assets/DEMO-002", async (r) => {
    await gate;
    const input = r.request().postDataJSON();
    const asset = state.snapshot.assets.find((a) => a.id === "DEMO-002")!;
    const from = {
      assignee: asset.assignee,
      location: asset.location,
      status: asset.status,
    };
    Object.assign(asset, {
      assignee: input.assignee,
      location: input.location,
      status: "Assigned",
      version: 2,
    });
    state.snapshot.history.unshift({
      id: "demo-move-ui",
      assetId: asset.id,
      action: input.action,
      actor: "Demo operator",
      at: new Date().toISOString(),
      from,
      to: {
        assignee: asset.assignee,
        location: asset.location,
        status: asset.status,
      },
      notes: input.notes,
    });
    await r.fulfill({ json: { asset } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/assets/DEMO-002");
  await page.getByRole("button", { name: "Move or assign" }).click();
  await page
    .getByLabel("Assign to", { exact: true })
    .selectOption("Nora Ellis");
  await page.getByLabel("Destination", { exact: true }).fill("Studio 2");
  await page.getByLabel("Movement notes").fill("Fictional handover");
  await page.getByRole("button", { name: "Confirm movement" }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("dialog")).toBeVisible();
  release();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".movement-card")).toContainText(
    "Fictional handover",
  );
  await expect(page.locator(".assignment-bridge")).toContainText("Nora Ellis");
});
test("valid photo, cancellation of delayed preparation and retake preserve draft", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/scan");
  await page.evaluate(() => {
    const original = window.createImageBitmap;
    window.createImageBitmap = ((
      ...args: Parameters<typeof createImageBitmap>
    ) =>
      new Promise<ImageBitmap>((resolve, reject) =>
        setTimeout(() => original(...args).then(resolve, reject), 1200),
      )) as typeof createImageBitmap;
  });
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 16, 16);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const png = Buffer.from(fixture, "base64");
  await page
    .getByLabel("Upload asset photos")
    .setInputFiles({ name: "demo.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Preparing your photo…")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(1400);
  await expect(
    page.getByRole("heading", { name: "Start with the label." }),
  ).toBeVisible();
  await page
    .getByLabel("Upload asset photos")
    .setInputFiles({ name: "demo.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("heading", { name: "Review the label." }),
  ).toBeVisible();
  await expect(page.getByAltText("Asset photo 1")).toBeVisible();
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await expect(page.getByText("No photo attached")).toBeVisible();
});
test("real browser save, edit and assignment are confirmed by local API", async ({
  page,
}) => {
  const serial = `UI-LOCAL-${Date.now()}`;
  await newIntake(page, serial);
  await page.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(page).toHaveURL(/assets\/DEMO-/);
  await expect(
    page.getByText("Saved in the local demo inventory"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Fictional browser save edited");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Fictional browser save edited",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move or assign" }).click();
  await page
    .getByLabel("Assign to", { exact: true })
    .selectOption("Nora Ellis");
  await page.getByRole("button", { name: "Confirm movement" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".assignment-bridge")).toContainText("Nora Ellis");
  await page.reload();
  await expect(page.locator(".assignment-bridge")).toContainText("Nora Ellis");
});
test("stale edit offers latest record while retaining unconfirmed changes", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/api/assets/DEMO-002", (r) =>
    r.fulfill({
      status: 409,
      json: {
        error:
          "This asset changed while you were editing. Reload it before saving.",
        assetId: "DEMO-002",
      },
    }),
  );
  await page.goto("/assets/DEMO-002");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("My pending change");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel("Asset name", { exact: true })).toHaveValue(
    "My pending change",
  );
  await expect(
    page.getByRole("button", { name: "Reload latest asset" }),
  ).toBeVisible();
});
