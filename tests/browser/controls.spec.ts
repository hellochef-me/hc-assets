import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../lib/fixtures";
import type { PreviewSource } from "../../lib/model";
const source: PreviewSource = {
  kind: "demo",
  label: "Local demo",
  readOnly: false,
  checkedAt: null,
  aiEnabled: false,
};
async function fixture(page: Page, value = source, longDirectory = false) {
  const data = structuredClone(fixtures());
  if (longDirectory)
    data.people.push(
      ...Array.from({ length: 60 }, (_, i) => ({
        name: `Fictional colleague ${String(i + 1).padStart(2, "0")} with a deliberately long full label for small-screen directory selection`,
        department: "Test",
      })),
    );
  await page.route("**/api/source", (r) => r.fulfill({ json: value }));
  await page.route("**/api/inventory", (r) =>
    r.fulfill({ json: { ...data, source: value } }),
  );
}
test("fake device camera preview/capture/retake/use stops streams and preserves photo for manual review", async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const counts = { stopped: 0, started: 0 };
    Object.assign(window, { cameraTestCounts: counts });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      counts.started++;
      const media = await get(constraints);
      media.getTracks().forEach((track) => {
        const stop = track.stop.bind(track);
        track.stop = () => {
          counts.stopped++;
          stop();
        };
      });
      return media;
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scan");
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture photo", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: "docs/screenshots/camera-preview-390.png" });
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(
    page.getByAltText("Captured device label awaiting confirmation"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture photo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Use photo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review the label." }),
  ).toBeVisible();
  await expect(page.getByAltText("Asset photo 1")).toBeVisible();
  await expect(
    page.getByText(/No AI extraction has been performed/),
  ).toBeVisible();
  const counts = await page.evaluate(
    () =>
      (
        window as unknown as {
          cameraTestCounts: { started: number; stopped: number };
        }
      ).cameraTestCounts,
  );
  expect(counts.started).toBe(2);
  expect(counts.stopped).toBe(2);
});
test("camera permission denial/no device/busy explains fallback; cancel never fabricates a photo", async ({
  page,
}) => {
  await fixture(page);
  for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError"]) {
    await page.goto("/scan");
    await page.evaluate((name) => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Fixture failure", name);
      };
    }, name);
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Retry camera" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload photo instead" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel camera", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Start with the label." }),
    ).toBeVisible();
  }
});
test("closing during pending permission stops a late stream and leaves capture usable", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/scan");
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.assign(window, { lateStopped: 0 });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const stream = await original(constraints);
      stream.getTracks().forEach((track) => {
        const stop = track.stop.bind(track);
        track.stop = () => {
          (window as unknown as { lateStopped: number }).lateStopped++;
          stop();
        };
      });
      return stream;
    };
  });
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { lateStopped: number }).lateStopped,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "Start with the label." }),
  ).toBeVisible();
});
test("camera releases device on Escape, route unmount and page hiding", async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.assign(window, { stoppedForCleanup: 0 });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      stream.getTracks().forEach((track) => {
        const stop = track.stop.bind(track);
        track.stop = () => {
          (window as unknown as { stoppedForCleanup: number })
            .stoppedForCleanup++;
          stop();
        };
      });
      return stream;
    };
  });
  for (const cleanup of ["escape", "navigate", "hide"]) {
    await page.goto("/scan");
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Capture photo", exact: true }),
    ).toBeVisible();
    if (cleanup === "escape") await page.keyboard.press("Escape");
    else if (cleanup === "navigate")
      await page
        .getByRole("link", { name: "Inventory", exact: true })
        .last()
        .click();
    else
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { stoppedForCleanup: number })
              .stoppedForCleanup,
        ),
      )
      .toBeGreaterThan(0);
  }
});
for (const width of [320, 390, 430])
  test(`select popover ${width}px: keyboard, long labels, scroll, escape, focus and accessible form portal`, async ({
    page,
  }) => {
    await fixture(page, source, true);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    if (width < 760)
      await page.getByRole("button", { name: "Toggle filters" }).click();
    const select = page.getByRole("combobox", {
      name: "Category filter",
      exact: true,
    });
    await select.focus();
    await select.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    const box = await page.getByRole("listbox").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `docs/screenshots/dropdown-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(select).toBeFocused();
    await select.click();
    await page.getByRole("option", { name: "Monitor", exact: true }).click();
    await expect(select).toContainText("Monitor");
    await page.goto("/assets/DEMO-001");
    await page
      .getByRole("button", { name: "Move or assign", exact: true })
      .click();
    const person = page.getByRole("combobox", {
      name: "Assign to",
      exact: true,
    });
    await person.click();
    await expect(
      page.getByRole("option", { name: "Nora Ellis", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(person).toBeFocused();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await person.click();
    await page.keyboard.press("End");
    const last = page
      .getByRole("listbox")
      .getByRole("option", { name: /Fictional colleague 60/ });
    await expect(last).toBeVisible();
    const longBox = await page.getByRole("listbox").boundingBox();
    expect(longBox!.x).toBeGreaterThanOrEqual(0);
    expect(longBox!.x + longBox!.width).toBeLessThanOrEqual(width);
    expect(
      await page.getByRole("listbox").evaluate((e) => !!e.closest("dialog")),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Enter");
    await expect(person).toContainText("Fictional colleague 60");
    await page.screenshot({
      path: `docs/screenshots/dropdown-dialog-${width}.png`,
    });
  });
test("read-only source removes registrations, disables edit/move and uses actual snapshot labels", async ({
  page,
}) => {
  const readonly: PreviewSource = {
    ...source,
    kind: "sheet-snapshot",
    label: "Real Sheet snapshot",
    readOnly: true,
    checkedAt: "2026-10-06T00:00:00Z",
  };
  await fixture(page, readonly);
  await page.goto("/");
  await expect(page.getByText("7 assets across your workplace")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add asset", exact: true }),
  ).toHaveCount(0);
  await page.goto("/assets/DEMO-001");
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move or assign", exact: true }),
  ).toBeDisabled();
});
test("OCR suggestions keep concurrent manual edits and still require human serial review", async ({
  page,
}) => {
  const enabled: PreviewSource = {
    ...source,
    kind: "staging",
    label: "Staging Sheet",
    aiEnabled: true,
  };
  await fixture(page, enabled);
  await page.route("**/api/scan", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await r.fulfill({
      json: {
        brand: "Dell",
        model: "Latitude 5440",
        serial: "FIXTURE-LABEL",
        specs: null,
        confidence: { serial: "high" },
      },
    });
  });
  await page.goto("/scan");
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload asset photos").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(
    page.getByRole("heading", { name: "Review the label." }),
  ).toBeVisible();
  await page.getByLabel("Brand", { exact: true }).fill("Manual brand");
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "FIXTURE-LABEL",
  );
  await expect(page.getByLabel("Brand", { exact: true })).toHaveValue(
    "Manual brand",
  );
  await expect(page.getByLabel("I checked this serial")).not.toBeChecked();
});
