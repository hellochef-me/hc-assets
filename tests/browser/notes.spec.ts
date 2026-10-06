import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../lib/fixtures";
import { blankAsset, type Asset, type PreviewSource } from "../../lib/model";
const source: PreviewSource = {
  kind: "demo",
  label: "Local demo",
  readOnly: false,
  checkedAt: null,
  aiEnabled: false,
  ocrEnabled: false,
  resaleEnabled: false,
};
async function setup(
  page: Page,
  notes = "Original line one\nOriginal line two",
) {
  const snapshot = { ...fixtures(), source };
  snapshot.assets[1] = {
    ...snapshot.assets[1],
    notes,
    location: "",
    serialChecked: false,
  };
  await page.route("**/api/source", (route) => route.fulfill({ json: source }));
  await page.route("**/api/inventory", (route) =>
    route.fulfill({ json: snapshot }),
  );
  return snapshot;
}
const section = (page: Page) =>
  page.getByRole("region", { name: "Notes", exact: true });
for (const width of [390, 1280])
  test(`bottom notes preserve existing multiline text, cancel, long drafts and accessibility at ${width}px`, async ({
    page,
  }) => {
    const snapshot = await setup(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/assets/DEMO-002");
    const notes = section(page);
    await expect(notes.locator(".asset-notes")).toHaveText(
      snapshot.assets[1].notes,
    );
    await expect(page.locator(".details-card .asset-notes")).toHaveCount(0);
    await expect(page.locator(".detail-layout + .notes-card")).toBeVisible();
    await notes.getByRole("button", { name: "Edit notes" }).click();
    await expect(notes.getByLabel("Asset notes")).toBeFocused();
    await expect(notes.getByLabel("Asset notes")).toHaveValue(
      snapshot.assets[1].notes,
    );
    await notes.getByLabel("Asset notes").fill("Unconfirmed draft");
    await notes.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(notes.locator(".asset-notes")).toHaveText(
      snapshot.assets[1].notes,
    );
    await expect(
      notes.getByRole("button", { name: "Edit notes" }),
    ).toBeFocused();
    await notes.getByRole("button", { name: "Edit notes" }).click();
    await notes.getByLabel("Asset notes").fill("x".repeat(2001));
    await notes.getByRole("button", { name: "Save notes" }).click();
    await expect(notes.getByRole("alert")).toContainText("2,000");
    await expect(notes.getByLabel("Asset notes")).toHaveValue("x".repeat(2001));
    await notes
      .getByLabel("Asset notes")
      .fill(
        "Checked charger and adapter.\nSpare cable is stored in the Locker.",
      );
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
    await notes.screenshot({
      path: `docs/screenshots/asset-notes-edit-${width}.png`,
    });
  });
test("notes-only retry keeps the same reference after a lost response and never replaces other fields", async ({
  page,
}) => {
  const snapshot = await setup(page);
  const requests: {
    notes: string;
    expectedVersion: number;
    requestId: string;
  }[] = [];
  const before = structuredClone(snapshot.assets[1]);
  await page.route("**/api/assets/DEMO-002", async (route) => {
    const input = route.request().postDataJSON();
    requests.push(input);
    if (requests.length === 1) {
      snapshot.assets[1] = {
        ...snapshot.assets[1],
        notes: input.notes,
        version: 2,
      };
      await route.abort("failed");
    } else await route.fulfill({ json: { asset: snapshot.assets[1] } });
  });
  await page.goto("/assets/DEMO-002");
  const notes = section(page);
  await notes.getByRole("button", { name: "Edit notes" }).click();
  const value = "A long note\n" + "x".repeat(1950);
  await notes.getByLabel("Asset notes").fill(value);
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(notes.getByRole("alert")).toContainText(
    "Connection interrupted",
  );
  await expect(notes.getByLabel("Asset notes")).toHaveValue(value);
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(notes.getByRole("status")).toContainText("Notes saved");
  expect(requests[1]).toEqual(requests[0]);
  expect(Object.keys(requests[0]).sort()).toEqual([
    "expectedVersion",
    "notes",
    "requestId",
  ]);
  expect(snapshot.assets[1].serial).toBe(before.serial);
  expect(snapshot.assets[1].location).toBe(before.location);
  await page.reload();
  await expect(section(page).locator(".asset-notes")).toHaveText(value);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("notes conflict review preserves the pending draft and requires an explicit choice before replacing the latest note", async ({
  page,
}) => {
  const snapshot = await setup(page);
  let attempts = 0;
  await page.route("**/api/assets/DEMO-002", async (route) => {
    const input = route.request().postDataJSON();
    if (++attempts === 1) {
      snapshot.assets[1] = {
        ...snapshot.assets[1],
        notes: "Another operator’s saved note",
        version: 2,
      };
      await route.fulfill({
        status: 409,
        json: { error: "Asset changed. Reload before saving." },
      });
    } else {
      expect(input.expectedVersion).toBe(2);
      snapshot.assets[1] = {
        ...snapshot.assets[1],
        notes: input.notes,
        version: 3,
      };
      await route.fulfill({ json: { asset: snapshot.assets[1] } });
    }
  });
  await page.goto("/assets/DEMO-002");
  const notes = section(page);
  await notes.getByRole("button", { name: "Edit notes" }).click();
  await notes.getByLabel("Asset notes").fill("My pending note");
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(
    notes.getByRole("button", { name: "Save notes" }),
  ).toBeDisabled();
  await notes.getByRole("button", { name: "Review latest note" }).click();
  await expect(notes.locator(".notes-conflict")).toContainText(
    "Another operator’s saved note",
  );
  await expect(notes.getByLabel("Asset notes")).toHaveValue("My pending note");
  await notes.getByRole("button", { name: "Keep my draft" }).click();
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(notes.locator(".asset-notes")).toHaveText("My pending note");
});
test("notes save and clear persist through the real fictional local API", async ({
  page,
  request,
}) => {
  const mode = await (await request.get("/api/source")).json();
  expect(mode.kind).toBe("demo"); // Never manufacture a production test record.
  const created = await request.post("/api/inventory", {
    data: {
      requestId: crypto.randomUUID(),
      asset: {
        ...blankAsset(),
        name: "Fictional notes acceptance",
        serial: `NOTES-${Date.now()}`,
        serialChecked: true,
      },
    },
  });
  expect(created.ok()).toBe(true);
  const asset: Asset = (await created.json()).asset;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/assets/${asset.id}`);
  let notes = section(page);
  await notes.getByRole("button", { name: "Add notes" }).click();
  await notes
    .getByLabel("Asset notes")
    .fill("Check hinge before handover.\nKeep charger with the asset.");
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(notes.getByRole("status")).toContainText("Notes saved");
  await page.reload();
  notes = section(page);
  await expect(notes.locator(".asset-notes")).toHaveText(
    "Check hinge before handover.\nKeep charger with the asset.",
  );
  await notes.screenshot({
    path: "docs/screenshots/asset-notes-saved-390.png",
  });
  await notes.getByRole("button", { name: "Edit notes" }).click();
  await notes.getByLabel("Asset notes").fill("");
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(notes.getByText("No notes added yet.")).toBeVisible();
  const snapshot = await (await request.get("/api/inventory")).json();
  expect(
    snapshot.assets.find((item: Asset) => item.id === asset.id).notes,
  ).toBe("");
  expect(
    snapshot.history.filter(
      (item: { assetId: string; action: string }) =>
        item.assetId === asset.id && item.action === "Notes updated",
    ),
  ).toHaveLength(2);
});
test("read-only notes and resale-disabled UI state cannot trigger a save or paid research", async ({
  page,
}) => {
  const snapshot = await setup(page);
  snapshot.source = {
    ...source,
    kind: "sheet-snapshot",
    label: "Real Sheet snapshot",
    readOnly: true,
  };
  await page.route("**/api/source", (route) =>
    route.fulfill({ json: snapshot.source }),
  );
  await page.goto("/assets/DEMO-002");
  await expect(
    section(page).getByRole("button", { name: "Edit notes" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Research resale value" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Resale research is currently disabled. Photo OCR is configured separately.",
    ),
  ).toBeVisible();
});

test("enabled resale researches on demand, shows sourced AED evidence and keeps a clear error on interruption", async ({
  page,
}) => {
  const snapshot = await setup(page);
  snapshot.source = {
    ...source,
    ocrEnabled: true,
    resaleEnabled: true,
    aiEnabled: true,
  };
  await page.route("**/api/source", (route) =>
    route.fulfill({ json: snapshot.source }),
  );
  let calls = 0;
  await page.route("**/api/resale", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ assetId: "DEMO-002" });
    if (++calls === 1)
      await route.fulfill({
        status: 503,
        json: { error: "The service did not respond. Try again explicitly." },
      });
    else
      await route.fulfill({
        json: {
          comparables: [
            {
              title: "Fictional Dell Latitude 5440",
              url: "https://revibe.me/products/fictional-ui-listing",
              price: 1250,
              currency: "AED",
              region: "UAE",
              condition: "Refurbished",
              checkedAt: "2026-10-06T00:00:00Z",
            },
          ],
          rangeAED: { low: 1250, high: 1250 },
          asOf: "2026-10-06T00:00:00Z",
          limitations: ["Fictional browser test evidence."],
        },
      });
  });
  await page.goto("/assets/DEMO-002");
  await expect(
    page.getByRole("button", { name: "Research resale value" }),
  ).toBeEnabled();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Research resale value" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "The service did not respond" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Research resale value" }).click();
  await expect(page.locator(".resale-value")).toHaveText("AED 1,250–1,250");
  await expect(
    page.getByRole("link", { name: "Fictional Dell Latitude 5440" }),
  ).toHaveAttribute("href", "https://revibe.me/products/fictional-ui-listing");
  await expect(page.locator(".market-evidence")).toContainText("06 Oct 2026");
  await expect(page.locator(".purchase-line")).not.toContainText("1,250");
});
