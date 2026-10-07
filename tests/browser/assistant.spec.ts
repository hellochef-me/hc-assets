import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../lib/fixtures";
import { inputOf, type Asset, type AssetInput } from "../../lib/model";
import { guidedInterpretation } from "../../lib/assistant-intent";
import {
  assistantStorageKey,
  freshAssistant,
  persistAssistant,
  type AssistantDraft,
} from "../../lib/assistant-flow";

// Every browser request is intercepted. These tests never depend on a live writer
// or a paid provider being configured in the server used for the local preview.
async function mockAssistant(
  page: Page,
  options: { dropCreate?: boolean; staleEdit?: boolean } = {},
) {
  const snapshot = fixtures();
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const receipts = new Map<string, Asset>();
  let dropped = false;
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 501, json: { error: "Unmocked QA request" } }),
  );
  await page.route("**/api/source", (route) =>
    route.fulfill({
      json: {
        kind: "demo",
        label: "Fictional QA inventory",
        readOnly: false,
        aiEnabled: false,
        ocrEnabled: true,
        resaleEnabled: false,
        checkedAt: null,
      },
    }),
  );
  await page.route("**/api/inventory", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: snapshot });
      return;
    }
    const body = route.request().postDataJSON() as {
      asset: AssetInput;
      requestId: string;
      assignee?: string;
    };
    writes.push({ path: "/api/inventory", body });
    let saved = receipts.get(body.requestId);
    if (!saved) {
      saved = {
        ...body.asset,
        id: "DEMO-QA-CREATED",
        assignee: body.assignee || "",
        status: body.assignee ? "Assigned" : "Needs review",
        version: 1,
        createdAt: "2026-10-07T12:00:00Z",
        updatedAt: "2026-10-07T12:00:00Z",
      };
      receipts.set(body.requestId, saved);
      snapshot.assets.unshift(saved);
    }
    if (options.dropCreate && !dropped) {
      dropped = true;
      await route.abort("failed");
      return;
    }
    await route.fulfill({ status: 201, json: { asset: saved } });
  });
  await page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: guidedInterpretation(route.request().postDataJSON()),
    }),
  );
  await page.route("**/api/assets/*", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    writes.push({ path: `/api/assets/${id}`, body });
    const saved = snapshot.assets.find((asset) => asset.id === id)!;
    if (
      options.staleEdit &&
      writes.filter((write) => write.path === `/api/assets/${id}`).length === 1
    ) {
      saved.version = 2;
      saved.notes = "Changed in another tab";
      await route.fulfill({
        status: 409,
        json: {
          error: "This asset changed. Reload it before saving.",
          code: "conflict",
        },
      });
      return;
    }
    if (body.asset) Object.assign(saved, body.asset);
    else
      Object.assign(saved, {
        assignee: ["Assign", "Transfer"].includes(String(body.action))
          ? body.assignee
          : "",
        location: body.location,
        status: ["Assign", "Transfer"].includes(String(body.action))
          ? "Assigned"
          : "Available",
      });
    saved.version++;
    await route.fulfill({ json: { asset: saved } });
  });
  return { snapshot, writes, receipts };
}

async function answer(page: Page, value: string) {
  const composer = page.getByRole("textbox", { name: /reply|answer|message/i });
  await composer.fill(value);
  await composer.press("Enter");
}

async function captureMobileAction(page: Page, name: string, path: string) {
  const action = page.getByRole("button", { name, exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  const control = await action.boundingBox();
  const composer = await page.locator(".it-composer").boundingBox();
  const stream = await page.locator(".it-message-stream").boundingBox();
  expect(control!.y).toBeGreaterThanOrEqual(stream!.y - 1);
  expect(control!.y + control!.height).toBeLessThanOrEqual(composer!.y + 1);
  await page.screenshot({ path, fullPage: true });
}

for (const width of [390, 1280, 1440]) {
  test(`Ask IT initial choices are accessible and fit ${width}px`, async ({
    page,
  }) => {
    await mockAssistant(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ask-it");
    await expect(
      page.getByRole("heading", { name: "Ask IT", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Register a device", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Find or update/ }),
    ).toBeVisible();
    const register = page.getByRole("button", {
      name: "Register a device",
      exact: true,
    });
    await register.focus();
    await expect(register).toBeFocused();
    await page.screenshot({
      path: `docs/screenshots/ask-it-start-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}

async function seed(page: Page, draft: AssistantDraft) {
  await page.addInitScript(
    ({ key, value }) => sessionStorage.setItem(key, value),
    {
      key: assistantStorageKey,
      value: persistAssistant(draft),
    },
  );
}

function registrationReview() {
  const draft = freshAssistant();
  draft.stage = "review";
  draft.asset.name = "Fictional QA laptop";
  draft.asset.serial = "QA-UNIQUE-7482";
  draft.asset.serialChecked = true;
  draft.asset.location = "Locker";
  draft.checkedSerial = draft.asset.serial;
  draft.draftId = "qa-registration-draft";
  return draft;
}

test("registration review writes only on explicit confirmation and retries the same command after response loss", async ({
  page,
}) => {
  const state = await mockAssistant(page, { dropCreate: true });
  await seed(page, registrationReview());
  await page.goto("/ask-it");
  await expect(
    page
      .getByRole("region", { name: "Review changes" })
      .getByText("Fictional QA laptop", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("button", {
      name: /Confirm registration|Save asset/,
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/interrupted|connection|Checking save status/i).first(),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await page
    .getByRole("button", {
      name: /Retry|Check save result|Confirm registration|Save asset/,
      exact: true,
    })
    .click();
  await expect(page.getByText(/Saved successfully\./).first()).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].body).toEqual(state.writes[0].body);
  expect(state.receipts.size).toBe(1);
  expect(
    state.snapshot.assets.filter((asset) => asset.serial === "QA-UNIQUE-7482"),
  ).toHaveLength(1);
  expect((state.writes[0].body.asset as AssetInput).photos).toEqual([]);
});

test("edit review retains asset identity and version and shows field-level changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await mockAssistant(page);
  const before = state.snapshot.assets[0];
  const draft = registrationReview();
  draft.mode = "edit";
  draft.selected = { ...before };
  draft.asset = { ...inputOf(before), notes: "QA edit proposal" };
  draft.assignee = before.assignee;
  draft.checkedSerial = before.serial;
  await seed(page, draft);
  await page.goto("/ask-it");
  await expect(
    page.getByText("QA edit proposal", { exact: false }).first(),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.screenshot({
    path: "docs/screenshots/ask-it-edit-review-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Confirm changes|Save changes/, exact: true })
    .click();
  await expect(page.getByText(/Saved successfully\./).first()).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].path).toBe("/api/assets/DEMO-001");
  expect(state.writes[0].body.expectedVersion).toBe(1);
  expect((state.writes[0].body.asset as AssetInput).notes).toBe(
    "QA edit proposal",
  );
});

test("stale edit confirmation keeps the proposal and requires a fresh review", async ({
  page,
}) => {
  const state = await mockAssistant(page, { staleEdit: true });
  const before = state.snapshot.assets[0];
  const draft = registrationReview();
  draft.mode = "edit";
  draft.selected = { ...before };
  draft.asset = { ...inputOf(before), notes: "QA stale proposal" };
  draft.assignee = before.assignee;
  draft.checkedSerial = before.serial;
  await seed(page, draft);
  await page.goto("/ask-it");
  await page
    .getByRole("button", { name: /Confirm changes|Save changes/, exact: true })
    .click();
  await expect(page.getByText(/changed|conflict/i).first()).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await expect(
    page.getByText("QA stale proposal", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reload latest and review", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm changes", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review changes" });
  await expect(review).toContainText("Changed in another tab");
  await expect(review).toContainText("QA stale proposal");
  expect(state.writes).toHaveLength(1);
  await page
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved successfully.", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].body.expectedVersion).toBe(2);
  expect(state.writes[1].body.requestId).not.toBe(
    state.writes[0].body.requestId,
  );
});

test("a normalized exact serial offers the existing record and never creates a duplicate", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  const draft = freshAssistant();
  draft.stage = "serial";
  await seed(page, draft);
  await page.goto("/ask-it");
  await answer(page, "  demo-c02x148  ");
  await page
    .getByRole("button", {
      name: /Yes, check inventory|Confirm serial|I checked this serial/i,
    })
    .click();
  await expect(
    page
      .getByText(/already registered|existing asset|existing record/i)
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("MacBook Pro 14", { exact: false }).first(),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await expect(
    page.getByRole("button", {
      name: /Confirm registration|Save asset/,
      exact: true,
    }),
  ).toHaveCount(0);
});

test("a near serial offers existing assets and explicit distinct-device continuation without attestations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockAssistant(page);
  const draft = freshAssistant();
  draft.stage = "serial";
  await seed(page, draft);
  await page.goto("/ask-it");
  await answer(page, "DEMO-C02X14");
  await page
    .getByRole("button", {
      name: /Yes, check inventory|Confirm serial|I checked this serial/i,
    })
    .click();
  await expect(
    page.getByText(/possible serial match|same device|similar serial/i).first(),
  ).toBeVisible();
  await expect(
    page.getByText("DEMO-C02X148", { exact: false }).first(),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await expect(
    page.getByRole("button", {
      name: /distinct device|Continue as (?:a different|new) device/i,
    }),
  ).toBeEnabled();
  await page.screenshot({
    path: "docs/screenshots/ask-it-near-match-390.png",
    fullPage: true,
  });
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue as a different device", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What should we call this device?", exact: true })).toBeVisible();
  const savedDraft = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).draft, assistantStorageKey);
  expect(savedDraft.reviewedMatchIds).toContain("DEMO-001");
  expect(state.writes).toHaveLength(0);
});

test("choice-first registration requires a real employee and an explicit final confirmation", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ask-it");
  await page
    .getByRole("button", { name: "Register a device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enter serial manually", exact: true })
    .click();
  await answer(page, "QA-CREATE-928471");
  await page
    .getByRole("button", { name: "Yes, check inventory", exact: true })
    .click();
  await answer(page, "Fictional assignment laptop");
  await page.getByRole("button", { name: "Laptop", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/ask-it-owner-390.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Assign to someone", exact: true })
    .click();
  await answer(page, "An unknown colleague");
  await expect(
    page.getByText("No matching employee. Try another name."),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await answer(page, "Nora");
  await page.getByRole("button", { name: /Nora Ellis/ }).click();
  await expect(
    page.getByText(/Optional · This becomes the inventory thumbnail/),
  ).toBeVisible();
  await expect(page.getByAltText("Device thumbnail preview")).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/ask-it-photo-guide-390.png",
    fullPage: true,
  });
  await captureMobileAction(
    page,
    "Skip for now",
    "docs/screenshots/ask-it-photo-actions-390.png",
  );
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review changes" });
  await expect(review).toContainText("Nora Ellis · With assignee");
  await expect(review).toContainText("Unknown");
  await page.screenshot({
    path: "docs/screenshots/ask-it-registration-review-390.png",
    fullPage: true,
  });
  await captureMobileAction(
    page,
    "Confirm registration",
    "docs/screenshots/ask-it-registration-actions-390.png",
  );
  await answer(page, "yes");
  await expect(
    page.getByText(/Use the confirmation button to save/),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm registration", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Saved successfully.", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.assignee).toBe("Nora Ellis");
  expect((state.writes[0].body.asset as AssetInput).location).toBe("");
  expect((state.writes[0].body.asset as AssetInput).condition).toBe("Unknown");
});

test("unknown serial needs an inventory search and explicit uncertainty acknowledgement", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  const draft = freshAssistant();
  draft.stage = "unknown";
  await seed(page, draft);
  await page.goto("/ask-it");
  const proceed = page.getByRole("button", {
    name: "Continue with unknown serial",
    exact: true,
  });
  await expect(proceed).toBeDisabled();
  await expect(
    page.getByText(/cannot conclusively rule out an existing record/),
  ).toBeVisible();
  await answer(page, "Dell");
  await expect(
    page.getByRole("button", { name: /Dell Latitude 5440/ }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(proceed).toBeEnabled();
  await proceed.click();
  await expect(
    page.getByRole("heading", {
      name: "What should we call this device?",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  const restored = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).draft,
    assistantStorageKey,
  );
  expect(restored.unknownConfirmed).toBe(true);
  expect(restored.asset.serial).toBe("");
});

test("duplicate employee names are blocked rather than assigned by inference", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  state.snapshot.people.push({ name: "Nora Ellis", department: "Engineering" });
  const draft = registrationReview();
  draft.stage = "employee";
  draft.query = "Nora";
  await seed(page, draft);
  await page.goto("/ask-it");
  const people = page.getByRole("button", { name: /Nora Ellis/ });
  await expect(people).toHaveCount(2);
  await expect(people.nth(0)).toBeDisabled();
  await expect(people.nth(1)).toBeDisabled();
  await answer(page, "Nora Ellis");
  expect(state.writes).toHaveLength(0);
  await expect(
    page.getByRole("heading", {
      name: "Who should be responsible for it?",
      exact: true,
    }),
  ).toBeVisible();
});

for (const action of ["Transfer", "Return"] as const) {
  test(`${action} previews owner and location before confirming the original asset ID`, async ({
    page,
  }) => {
    const state = await mockAssistant(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ask-it?asset=DEMO-001");
    await page
      .getByRole("button", { name: "Reassign owner or move", exact: true })
      .click();
    if (action === "Transfer") {
      await page
        .getByRole("button", { name: "Find an employee", exact: true })
        .click();
      await page.getByRole("button", { name: /Maya Chen/ }).click();
    } else {
      await page
        .getByRole("button", { name: "Return to Locker", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Review movement", exact: true })
      .click();
    const review = page.getByRole("region", { name: "Review changes" });
    await expect(review).toContainText("Nora Ellis");
    await expect(review).toContainText(
      action === "Transfer" ? "Maya Chen" : "Unassigned",
    );
    await expect(review).toContainText(
      action === "Transfer" ? "With assignee" : "Locker",
    );
    expect(state.writes).toHaveLength(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `docs/screenshots/ask-it-${action.toLowerCase()}-review-390.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: action === "Transfer" ? "Confirm reassignment" : "Confirm return",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Saved successfully.", exact: true }),
    ).toBeVisible();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].path).toBe("/api/assets/DEMO-001");
    expect(state.writes[0].body.expectedVersion).toBe(1);
    expect(state.writes[0].body.action).toBe(action);
    expect(state.writes[0].body.location).toBe(
      action === "Transfer" ? "" : "Locker",
    );
  });
}

test("cancelled label reading cannot replace a newer manual serial or retain label bytes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockAssistant(page);
  let finish!: () => void;
  let returned = false;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/assistant/scan", async (route) => {
    await gate;
    await route
      .fulfill({
        json: {
          extraction: {
            brand: "Apple",
            model: "Late model",
            serial: "LATE-OCR-SERIAL",
            specs: null,
            confidence: { serial: "high" },
          },
          mode: "demo",
          notice: "Fictional late label extraction",
        },
      })
      .catch(() => {});
    returned = true;
  });
  await page.goto("/ask-it");
  await page
    .getByRole("button", { name: "Register a device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Upload label photo", exact: true })
    .click();
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 24;
      c.height = 24;
      return c.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await page.getByLabel("Upload Ask IT photo", { exact: true }).setInputFiles({
    name: "fictional-label.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("heading", { name: "Reading the label…", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/ask-it-reading-390.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter serial manually", exact: true })
    .click();
  await answer(page, "QA-MANUAL-AFTER-CANCEL");
  finish();
  await expect.poll(() => returned).toBe(true);
  await expect(
    page.getByRole("heading", { name: /I have serial QA-MANUAL-AFTER-CANCEL/ }),
  ).toBeVisible();
  await expect(page.getByText("LATE-OCR-SERIAL", { exact: false })).toHaveCount(
    0,
  );
  const persisted = await page.evaluate(
    (key) => sessionStorage.getItem(key)!,
    assistantStorageKey,
  );
  expect(persisted).not.toContain("data:image");
  expect(JSON.parse(persisted).draft.asset.photos).toEqual([]);
  expect(state.writes).toHaveLength(0);
});

test("specifications and accessories use separate entries in Ask IT and retain newline storage on confirmation", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ask-it?asset=DEMO-001");
  await page
    .getByRole("button", { name: "Update details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Specifications", exact: true })
    .click();
  const specs = page.getByRole("group", {
    name: "Specifications",
    exact: true,
  });
  await specs
    .getByRole("textbox", { name: "Specifications entry 1", exact: true })
    .fill("32 GB RAM");
  await specs.getByRole("button", { name: "Add entry", exact: true }).click();
  await specs
    .getByRole("textbox", { name: "Specifications entry 2", exact: true })
    .fill("1 TB SSD");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use these details", exact: true })
    .click();
  await page.getByRole("button", { name: "Accessories", exact: true }).click();
  const accessories = page.getByRole("group", {
    name: "Accessories",
    exact: true,
  });
  await accessories
    .getByRole("button", { name: "Add entry", exact: true })
    .click();
  await accessories
    .getByRole("textbox", { name: "Accessories entry 2", exact: true })
    .fill("HDMI cable");
  await page
    .getByRole("button", { name: "Use these details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review changes" });
  await expect(
    review.locator(".it-new-value").getByRole("listitem"),
  ).toHaveText(["32 GB RAM", "1 TB SSD", "Charger", "HDMI cable"]);
  expect(state.writes).toHaveLength(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/ask-it-specs-accessories-review-390.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved successfully.", exact: true }),
  ).toBeVisible();
  const saved = state.writes[0].body.asset as AssetInput;
  expect(saved.specs).toBe("32 GB RAM\n1 TB SSD");
  expect(saved.accessories).toBe("Charger\nHDMI cable");
});

test("resale remains indicative and read-only until saving the reviewed notes", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  await page.route("**/api/assistant/resale", (route) =>
    route.fulfill({
      json: {
        evidence: {
          comparables: [],
          rangeAED: null,
          asOf: null,
          limitations: ["Fictional QA fixture. No market research performed."],
          indicative: {
            goodWorkingAED: { low: 600, high: 900 },
            estimatedAt: "2026-10-07T00:00:00Z",
            basis: "model-estimate",
            reasoning: "Illustrative QA fixture only.",
            assumptions: ["Actual battery and function were not inspected."],
          },
        },
        mode: "demo",
        notice: "Fictional indicative estimate. No listings checked.",
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ask-it?asset=DEMO-001");
  await page
    .getByRole("button", { name: "Estimate resale value", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quick indicative estimate", exact: true })
    .click();
  const scenarios = page.getByRole("region", {
    name: "Indicative resale scenarios",
    exact: true,
  });
  await expect(scenarios).toContainText("AED 600–900");
  await expect(scenarios).toContainText("Fair · working with wear");
  await expect(scenarios).toContainText("Faulty · parts only");
  await scenarios
    .getByText("Assumptions and market sources", { exact: true })
    .click();
  await expect(scenarios).toContainText("No verified market sources.");
  await expect(scenarios).toContainText("7 Oct 2026");
  expect(state.writes).toHaveLength(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/ask-it-resale-390.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Review saving estimate to notes",
      exact: true,
    })
    .click();
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved successfully.", exact: true }),
  ).toBeVisible();
  const saved = state.writes[0].body.asset as AssetInput;
  expect(saved.purchaseCost).toBe("6499");
  expect(saved.notes).toContain("Indicative resale");
});

test("explicit Scan and Ask IT handoffs preserve the draft identity and never submit it", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  await page.goto("/scan?manual=1");
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Fictional shared draft");
  await page
    .getByLabel("Serial number", { exact: true })
    .fill("QA-HANDOFF-740001");
  await page
    .getByRole("link", {
      name: "Prefer a conversation? Continue with Ask IT",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: /I have serial QA-HANDOFF-740001/ }),
  ).toBeVisible();
  const before = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).draft,
    assistantStorageKey,
  );
  await page
    .getByRole("link", { name: "Continue in Scan", exact: true })
    .click();
  await expect(page.getByLabel("Asset name", { exact: true })).toHaveValue(
    "Fictional shared draft",
  );
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "QA-HANDOFF-740001",
  );
  await page
    .getByRole("link", {
      name: "Prefer a conversation? Continue with Ask IT",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: /I have serial QA-HANDOFF-740001/ }),
  ).toBeVisible();
  const after = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).draft,
    assistantStorageKey,
  );
  expect(after.draftId).toBe(before.draftId);
  expect(after.asset.name).toBe(before.asset.name);
  expect(state.writes).toHaveLength(0);
});

test("unassigned registration cannot confirm without an allowed storage location", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  const draft = registrationReview();
  draft.asset.location = "";
  await seed(page, draft);
  await page.goto("/ask-it");
  await page
    .getByRole("button", { name: "Confirm registration", exact: true })
    .click();
  await expect(
    page.getByText(
      /Choose Engineering Area or Locker when the asset is unassigned/,
    ),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test("typed photo skip and Good condition save without inspection attestations", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  const draft = registrationReview();
  draft.stage = "photo";
  await seed(page, draft);
  await page.goto("/ask-it");
  await answer(page, "skip for now");
  await expect(
    page.getByRole("button", { name: "Review registration", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Condition", exact: true }).click();
  await answer(page, "Good");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Review registration", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Review changes", exact: true }),
  ).toContainText("Good");
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm registration", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved successfully.", exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect((state.writes[0].body.asset as AssetInput).condition).toBe("Good");
  expect((state.writes[0].body.asset as AssetInput).conditionChecked).toBe(false);

});

test("typed return to Locker prepares a reviewed return without submitting it", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  await page.goto("/ask-it?asset=DEMO-001");
  await page
    .getByRole("button", { name: "Reassign owner or move", exact: true })
    .click();
  await answer(page, "return to Locker");
  await page
    .getByRole("button", { name: "Review movement", exact: true })
    .click();
  const review = page.getByRole("region", {
    name: "Review changes",
    exact: true,
  });
  await expect(review).toContainText("Nora Ellis");
  await expect(review).toContainText("Unassigned");
  await expect(review).toContainText("Locker");
  await expect(
    page.getByRole("button", { name: "Confirm return", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  const persisted = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).draft,
    assistantStorageKey,
  );
  expect(persisted.action).toBe("Return");
  expect(persisted.asset.location).toBe("Locker");
  expect(persisted.assignee).toBe("");
});

test("typed manual entry and negative serial confirmation never interpret no as a new serial", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  await page.goto("/ask-it");
  await page
    .getByRole("button", { name: "Register a device", exact: true })
    .click();
  await answer(page, "enter serial manually");
  await expect(
    page.getByRole("heading", {
      name: "What serial number is on the device?",
      exact: true,
    }),
  ).toBeVisible();
  await answer(page, "QA-TYPED-CONFIRM-8174");
  await expect(
    page.getByRole("button", { name: "Yes, check inventory", exact: true }),
  ).toBeVisible();
  await answer(page, "no");
  await expect(
    page.getByRole("heading", {
      name: "What serial number is on the device?",
      exact: true,
    }),
  ).toBeVisible();
  const persisted = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).draft,
    assistantStorageKey,
  );
  expect(persisted.asset.serial).toBe("QA-TYPED-CONFIRM-8174");
  expect(persisted.asset.serialChecked).toBe(false);
  expect(persisted.checkedSerial).toBeNull();
  expect(state.writes).toHaveLength(0);
});

test("storage edits preserve assigned ownership and move unassigned devices only after review", async ({
  page,
}) => {
  const state = await mockAssistant(page);
  await page.goto("/ask-it?asset=DEMO-001");
  await page
    .getByRole("button", { name: "Update details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Storage location", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Engineering Area", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const assignedReview = page.getByRole("region", {
    name: "Review changes",
    exact: true,
  });
  await expect(assignedReview).toContainText("Nora Ellis");
  await expect(assignedReview).toContainText("DEMO-C02X148");
  await expect(assignedReview).toContainText("Locker");
  await expect(assignedReview).toContainText("Engineering Area");
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved successfully.", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].path).toBe("/api/assets/DEMO-001");
  expect((state.writes[0].body.asset as AssetInput).serial).toBe(
    "DEMO-C02X148",
  );
  expect((state.writes[0].body.asset as AssetInput).location).toBe(
    "Engineering Area",
  );
  expect(
    state.snapshot.assets.find((asset) => asset.id === "DEMO-001")?.assignee,
  ).toBe("Nora Ellis");

  await page.goto("/ask-it?asset=DEMO-002");
  await page
    .getByRole("button", { name: "Reassign owner or move", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Change storage location", exact: true })
    .click();
  await page.getByRole("button", { name: "Locker", exact: true }).click();
  expect(state.writes).toHaveLength(1);
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const unassignedReview = page.getByRole("region", {
    name: "Review changes",
    exact: true,
  });
  await expect(unassignedReview).toContainText("Unassigned");
  await expect(unassignedReview).toContainText("DEMO-DL5440");
  await expect(unassignedReview).toContainText("Engineering Area");
  await expect(unassignedReview).toContainText("Locker");
  expect(state.writes).toHaveLength(1);
  await page
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved successfully.", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].path).toBe("/api/assets/DEMO-002");
  expect(state.writes[1].body.action).toBeUndefined();
  expect(state.writes[1].body.expectedVersion).toBe(1);
  expect((state.writes[1].body.asset as AssetInput).serial).toBe("DEMO-DL5440");
  expect((state.writes[1].body.asset as AssetInput).location).toBe("Locker");
  expect(
    state.snapshot.assets.find((asset) => asset.id === "DEMO-002")?.assignee,
  ).toBe("");
});
