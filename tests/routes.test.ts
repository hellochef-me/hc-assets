import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writerMock } from "./helpers/writer";
import { blankAsset } from "../lib/model";
const response = (text: unknown) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(text) }],
      },
    ],
  });
const req = (route: string, data: unknown, method = "POST") =>
  new Request(`http://127.0.0.1:3405${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3405",
    },
    body: JSON.stringify(data),
  });
test("full staging routes: OCR → create/duplicate/retry → assignment history → sourced AED resale, entirely mocked outbound services", async () => {
  const originalDirectory = process.cwd(),
    originalFetch = globalThis.fetch;
  const names = [
    "HC_ASSETS_BACKEND",
    "HC_ASSETS_SPREADSHEET_ID",
    "HC_ASSETS_GATEWAY_URL",
    "HC_ASSETS_GATEWAY_SECRET",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    "HC_ASSETS_AI_ENABLED",
    "OPENAI_API_KEY",
    "HC_ASSETS_OPENAI_MODEL",
    "HC_ASSETS_SEARCH_MODEL",
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const directory = await mkdtemp(path.join(tmpdir(), "hc-routes-test-"));
  const writer = await writerMock();
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const fakeEnv = [
    "staging",
    "fictional-sheet",
    "https://script.google.com/macros/s/fictional/exec",
    "fixture-secret-32-characters-only",
    "fictional@test.invalid",
    privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    "approved",
    "fictional-openai-token",
    "fictional-vision",
    "fictional-search",
  ];
  let paidAttempts = 0;
  try {
    names.forEach((name, i) => {
      process.env[name] = fakeEnv[i];
    });
    process.chdir(directory);
    globalThis.fetch = async (url, init) => {
      const value = String(url);
      if (value === "https://oauth2.googleapis.com/token")
        return Response.json({
          access_token: "fictional-google-token",
          token_type: "Bearer",
          expires_in: 3600,
        });
      if (value.startsWith("https://sheets.googleapis.com/"))
        return Response.json({
          valueRanges: writer.tables.slice(0, 5).map((values) => ({ values })),
        });
      if (value.startsWith("https://script.google.com/"))
        return writer.fetcher(url, init);
      if (value === "https://api.openai.com/v1/responses") {
        paidAttempts++;
        const body = JSON.parse(String(init?.body));
        if (body.tools)
          return Response.json({
            status: "completed",
            output: [
              {
                type: "web_search_call",
                action: {
                  sources: [
                    { url: "https://uae.dubizzle.com/fixture-listing" },
                  ],
                },
              },
              {
                type: "message",
                content: [
                  { type: "output_text", text: "Cited fixture source" },
                ],
              },
            ],
          });
        if (body.text.format.name === "listing_evidence")
          return response({
            comparables: [
              {
                sourceIndex: 0,
                title: "Fixture",
                price: 1250,
                currency: "AED",
                priceQuote: "AED 1,250",
                identityQuote: "Dell Latitude 5440",
                conditionQuote: "Used",
              },
            ],
          });
        return response({
          brand: { value: "Dell", evidence: "Dell", confidence: "high" },
          model: {
            value: "Latitude 5440",
            evidence: "Latitude 5440",
            confidence: "high",
          },
          serial: {
            value: "FIXTURE-NEW-01",
            evidence: "FIXTURE-NEW-01",
            confidence: "high",
          },
          specs: { value: null, evidence: null, confidence: "unknown" },
        });
      }
      if (value === "https://uae.dubizzle.com/fixture-listing")
        return new Response(
          "<h1>Dell Latitude 5440</h1><p>Used</p><p>AED 1,250</p>",
          { headers: { "Content-Type": "text/html" } },
        );
      throw new Error("Unmocked outbound request was blocked");
    };
    const scan = await import("../app/api/scan/route");
    const inventory = await import("../app/api/inventory/route");
    const detail = await import("../app/api/assets/[id]/route");
    const resale = await import("../app/api/resale/route");
    const recognized = await scan.POST(
      req("/api/scan", { photos: ["data:image/png;base64,AAAA"] }),
    );
    assert.equal(recognized.status, 200);
    const labels = await recognized.json();
    assert.equal(labels.serial, "FIXTURE-NEW-01");
    const input = {
      requestId: randomUUID(),
      asset: {
        ...blankAsset(),
        name: "Fixture staging laptop",
        brand: labels.brand,
        model: labels.model,
        serial: labels.serial,
        serialChecked: true,
      },
    };
    const first = await inventory.POST(req("/api/inventory", input));
    assert.equal(first.status, 201);
    const saved = await first.json();
    assert.ok(saved.asset.id);
    const retry = await inventory.POST(req("/api/inventory", input));
    assert.deepEqual(await retry.json(), saved);
    assert.equal(writer.calls(), 1);
    assert.equal(
      (
        await inventory.POST(
          req("/api/inventory", { ...input, requestId: randomUUID() }),
        )
      ).status,
      409,
    );
    const moved = await detail.PATCH(
      req(
        `/api/assets/${saved.asset.id}`,
        {
          action: "Assign",
          assignee: "Fixture Person",
          location: "Fixture office",
          notes: "Complete fixture audit",
          expectedVersion: 1,
          requestId: randomUUID(),
        },
        "PATCH",
      ),
      { params: Promise.resolve({ id: saved.asset.id }) },
    );
    assert.equal(moved.status, 200);
    const snapshot = await (
      await inventory.GET(new Request("http://127.0.0.1:3405/api/inventory"))
    ).json();
    assert.equal(snapshot.assets.length, 1);
    assert.equal(snapshot.history.length, 2);
    assert.equal(snapshot.assets[0].assignee, "Fixture Person");
    assert.equal(
      snapshot.history.find((e: { action: string }) => e.action === "Assign").to
        .location,
      "Fixture office",
    );
    const market = await resale.POST(
      req("/api/resale", { assetId: saved.asset.id }),
    );
    assert.equal(market.status, 200);
    const evidence = await market.json();
    assert.deepEqual(evidence.rangeAED, { low: 1250, high: 1250 });
    assert.equal(evidence.comparables[0].currency, "AED");
    assert.equal(paidAttempts, 3);
    assert.equal(writer.calls(), 2);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(originalDirectory);
    names.forEach((name) => {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
    await rm(directory, { recursive: true, force: true });
  }
});
