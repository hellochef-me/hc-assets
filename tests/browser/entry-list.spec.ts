import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../lib/fixtures";
import type { AssetInput, PreviewSource } from "../../lib/model";

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
  specs = "16 GB / 512 GB",
  accessories = "Charger, cable; adapter",
) {
  const snapshot = { ...fixtures(), source };
  snapshot.assets[1] = {
    ...snapshot.assets[1],
    specs,
    accessories,
    specsChecked: !!specs,
  };
  const edits: {
    asset: AssetInput;
    expectedVersion: number;
    requestId: string;
  }[] = [];
  await page.route("**/api/source", (route) => route.fulfill({ json: source }));
  await page.route("**/api/inventory", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.route("**/api/assets/DEMO-002", (route) => {
    const input = route.request().postDataJSON();
    edits.push(input);
    snapshot.assets[1] = {
      ...snapshot.assets[1],
      ...input.asset,
      version: snapshot.assets[1].version + 1,
    };
    return route.fulfill({ json: { asset: snapshot.assets[1] } });
  });
  return { snapshot, edits };
}
async function edit(page: Page) {
  await page.goto("/assets/DEMO-002");
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByText("Specifications & accessories", { exact: true })
    .click();
  return dialog;
}
async function paste(input: Locator, text: string) {
  await input.evaluate((element: HTMLInputElement, text) => {
    element.focus();
    element.setSelectionRange(0, element.value.length);
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, text);
}

for (const width of [390, 1280]) {
  test(`multiple entries edit, review, save and reload as bullet lists at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const { snapshot, edits } = await setup(page);
    const untouched = structuredClone(
      snapshot.assets.filter((a) => a.id !== "DEMO-002"),
    );
    const dialog = await edit(page);
    const specs = dialog.getByRole("group", {
      name: "Specifications",
      exact: true,
    });
    const accessories = dialog.getByRole("group", {
      name: "Accessories",
      exact: true,
    });
    await expect(specs.getByRole("textbox")).toHaveCount(1);
    await expect(
      specs.getByLabel("Specifications entry 1", { exact: true }),
    ).toHaveValue("16 GB / 512 GB");
    await expect(accessories.getByRole("textbox")).toHaveCount(1);
    await expect(
      accessories.getByLabel("Accessories entry 1", { exact: true }),
    ).toHaveValue("Charger, cable; adapter");
    await specs.getByRole("button", { name: "Add entry" }).click();
    await expect(
      specs.getByLabel("Specifications entry 2", { exact: true }),
    ).toBeFocused();
    // Editing entries does not require a verification checkbox.
    await expect(
      dialog.getByLabel("Specifications verified on the device"),
    ).toHaveCount(0);
    await specs
      .getByLabel("Specifications entry 2", { exact: true })
      .fill("M2 processor");
    await expect(
      dialog.getByLabel("Specifications verified on the device"),
    ).toHaveCount(0);
    await paste(
      accessories.getByLabel("Accessories entry 1", { exact: true }),
      "USB-C charger\r\nDock\nSpare cable",
    );
    await expect(accessories.getByRole("textbox")).toHaveCount(3);
    await accessories
      .getByRole("button", { name: "Remove accessories entry 2" })
      .click();
    await expect(
      accessories.getByLabel("Accessories entry 2", { exact: true }),
    ).toHaveValue("Spare cable");

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
    await dialog
      .getByRole("button", { name: "Review changes", exact: true })
      .click();
    const changed = dialog.locator(".change-row").filter({
      has: page.getByRole("heading", { name: "Specifications", exact: true }),
    });
    await expect(changed.locator("ul").last().locator("li")).toHaveText([
      "16 GB / 512 GB",
      "M2 processor",
    ]);
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(edits).toHaveLength(1);
    expect(edits[0].asset.specs).toBe("16 GB / 512 GB\nM2 processor");
    expect(edits[0].asset.accessories).toBe("USB-C charger\nSpare cable");
    expect(edits[0].asset.specsChecked).toBe(false);
    expect(snapshot.assets.filter((a) => a.id !== "DEMO-002")).toEqual(
      untouched,
    );
    await page.reload();
    const details = page.locator(".details-card");
    await expect(
      details
        .locator("dl > div")
        .filter({ hasText: "Specifications" })
        .locator("li"),
    ).toHaveText(["16 GB / 512 GB", "M2 processor"]);
    await expect(
      details
        .locator("dl > div")
        .filter({ hasText: "Accessories" })
        .locator("li"),
    ).toHaveText(["USB-C charger", "Spare cable"]);
  });
}

test("aggregate limit rejects oversized paste without data loss; cancel and clear preserve their expected records", async ({
  page,
}) => {
  const { edits } = await setup(page, "16 GB\n512 GB", "Charger\nCable");
  let dialog = await edit(page);
  let accessories = dialog.getByRole("group", {
    name: "Accessories",
    exact: true,
  });
  await paste(
    accessories.getByLabel("Accessories entry 1", { exact: true }),
    "x".repeat(399) + "\nDock",
  );
  await expect(accessories.getByRole("alert")).toContainText(
    "400 characters in total",
  );
  await expect(
    accessories.getByLabel("Accessories entry 1", { exact: true }),
  ).toHaveValue("Charger");
  await expect(
    accessories.getByLabel("Accessories entry 2", { exact: true }),
  ).toHaveValue("Cable");
  await accessories
    .getByLabel("Accessories entry 1", { exact: true })
    .fill("Draft only");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(edits).toHaveLength(0);
  dialog = await edit(page);
  accessories = dialog.getByRole("group", { name: "Accessories", exact: true });
  await expect(
    accessories.getByLabel("Accessories entry 1", { exact: true }),
  ).toHaveValue("Charger");
  await accessories
    .getByRole("button", { name: "Remove accessories entry 2" })
    .click();
  await accessories
    .getByRole("button", { name: "Remove accessories entry 1" })
    .click();
  await expect(accessories.getByRole("textbox")).toHaveCount(1);
  await expect(accessories.getByRole("textbox")).toHaveValue("");
  await dialog.getByRole("button", { name: "Review changes" }).click();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.reload();
  const display = page
    .locator(".details-card dl > div")
    .filter({ hasText: "Accessories" });
  await expect(display).toContainText("Not checked");
  await expect(display.locator("li")).toHaveCount(0);
  expect(edits[0].asset.specs).toBe("16 GB\n512 GB");
  expect(edits[0].asset.accessories).toBe("");
});

test("Scan uses the shared multi-entry fields and submits newline strings", async ({
  page,
}) => {
  const { snapshot } = await setup(page);
  let saved: AssetInput | undefined;
  await page.route("**/api/inventory", (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON().asset;
      return route.fulfill({
        json: { asset: { ...snapshot.assets[1], ...saved, id: "DEMO-002" } },
      });
    }
    return route.fulfill({ json: snapshot });
  });
  await page.goto("/scan?manual=1");
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Fictional multi-entry Scan");
  await page
    .getByLabel("Serial number", { exact: true })
    .fill("LIST-SCAN-NEW-123");

  await page
    .getByText("Specifications, condition & accessories", { exact: true })
    .click();
  const specs = page.getByRole("group", {
    name: "Specifications",
    exact: true,
  });
  const accessories = page.getByRole("group", {
    name: "Accessories",
    exact: true,
  });
  await paste(
    specs.getByLabel("Specifications entry 1", { exact: true }),
    "16 GB RAM\n512 GB storage",
  );
  await paste(
    accessories.getByLabel("Accessories entry 1", { exact: true }),
    "USB-C charger\nDock",
  );

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByText("Additional details", { exact: true }).click();
  await expect(page.locator(".confirmation-extra")).toContainText("16 GB RAM");
  await expect(page.locator(".confirmation-extra")).toContainText(
    "512 GB storage",
  );
  await expect(
    page
      .locator(".confirmation-extra dl > div")
      .filter({ hasText: "Specifications" })
      .locator("li"),
  ).toHaveText(["16 GB RAM", "512 GB storage"]);
  await expect(
    page
      .locator(".confirmation-extra dl > div")
      .filter({ hasText: "Accessories" })
      .locator("li"),
  ).toHaveText(["USB-C charger", "Dock"]);
  await page.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(page).toHaveURL(/assets\/DEMO-002/);
  expect(saved?.specs).toBe("16 GB RAM\n512 GB storage");
  expect(saved?.accessories).toBe("USB-C charger\nDock");
});
