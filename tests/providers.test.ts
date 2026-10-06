import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { blankAsset } from "../lib/model";
import { inventoryHeaders } from "../lib/server/sheets";
import { OpenAiAssetIntelligence } from "../lib/server/openai-intelligence";
import { GoogleServiceAccountToken } from "../lib/server/google-auth";
import { ControlledSheetGateway } from "../lib/server/sheet-gateway";
import { writerMock } from "./helpers/writer";
import { providerJson } from "../lib/server/provider-http";
import {
  ControlledSheetReader,
  decodeControlledSnapshot,
} from "../lib/server/sheet-snapshot";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const aiResponse = (value: unknown) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    },
  ],
});
const models = {
  apiKey: "fictional-test-token",
  visionModel: "test-vision",
  searchModel: "test-search",
};
const sample = () => ({
  ...blankAsset(),
  name: "Test laptop",
  serial: "NEW-1",
  serialChecked: true,
});
test("OCR uses server Responses API, strict evidence and unknown fields", async () => {
  let calls = 0;
  const provider = new OpenAiAssetIntelligence(models, async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer fictional-test-token",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(
      body.input[0].content[1].image_url,
      "data:image/png;base64,AAAA",
    );
    assert.match(body.instructions, /Never infer battery health/);
    return json(
      aiResponse({
        brand: { value: "Dell", evidence: "Dell", confidence: "high" },
        model: { value: "5440", evidence: "Latitude 5440", confidence: "low" },
        serial: {
          value: "invented",
          evidence: "illegible",
          confidence: "high",
        },
        specs: { value: null, evidence: null, confidence: "unknown" },
      }),
    );
  });
  const result = await provider.extract(["data:image/png;base64,AAAA"]);
  assert.equal(result.brand, "Dell");
  assert.equal(result.model, "5440");
  assert.equal(result.serial, null);
  assert.equal(result.confidence.serial, "unknown");
  await assert.rejects(provider.extract(["https://arbitrary-host/photo"]));
  assert.equal(calls, 1);
});
test("AI refusal, incomplete, invalid schema and 429 fail without retries or upstream secrets", async () => {
  for (const reply of [
    json({ status: "incomplete", output: [] }),
    json(aiResponse({ serial: "bad" })),
    json({ error: "sensitive-provider-body" }, 429),
  ]) {
    let calls = 0;
    const p = new OpenAiAssetIntelligence(models, async () => {
      calls++;
      return reply;
    });
    await assert.rejects(p.extract(["data:image/png;base64,AAAA"]), (error) => {
      assert.doesNotMatch(String(error), /sensitive-provider-body/);
      return true;
    });
    assert.equal(calls, 1);
  }
});
test("resale requires independently fetched AED model/used/price quotes; source URLs are allowlisted", async () => {
  const urls: string[] = [];
  let aiCalls = 0;
  const p = new OpenAiAssetIntelligence(
    models,
    async (url) => {
      urls.push(String(url));
      if (String(url).includes("api.openai.com")) {
        if (++aiCalls === 1)
          return json({
            status: "completed",
            output: [
              {
                type: "web_search_call",
                action: {
                  sources: [
                    { url: "https://uae.dubizzle.com/listing/test" },
                    { url: "http://127.0.0.1/private" },
                    { url: "https://evil.example/listing" },
                  ],
                },
              },
              {
                type: "message",
                content: [
                  { type: "output_text", text: "Found cited listings." },
                ],
              },
            ],
          });
        return json(
          aiResponse({
            comparables: [
              {
                sourceIndex: 0,
                title: "Untrusted title",
                price: 1250,
                currency: "AED",
                priceQuote: "AED 1,250",
                identityQuote: "Dell Latitude 5440",
                conditionQuote: "Used",
              },
              {
                sourceIndex: 0,
                title: "Duplicate",
                price: 9999,
                currency: "AED",
                priceQuote: "AED 9,999",
                identityQuote: "Dell Latitude 5440",
                conditionQuote: "Used",
              },
            ],
          }),
        );
      }
      return new Response(
        "<html><script>Invented AED 9,999</script><h1>Dell Latitude 5440</h1><p>Used</p><p>AED 1,250</p></html>",
        { headers: { "Content-Type": "text/html" } },
      );
    },
    () => new Date("2026-10-06T00:00:00Z"),
  );
  const result = await p.resale({
    brand: "Dell",
    model: "Latitude 5440",
    specs: "",
    condition: "Unknown",
  });
  assert.equal(result.comparables.length, 1);
  assert.equal(result.comparables[0].title, "Dell Latitude 5440");
  assert.deepEqual(result.rangeAED, { low: 1250, high: 1250 });
  assert.equal(result.asOf, "2026-10-06T00:00:00.000Z");
  assert.ok(
    !urls.some((url) => url.includes("evil") || url.includes("127.0.0.1")),
  );
  assert.equal(aiCalls, 2);
});
test("unreadable listing and fabricated quote never become verified evidence; malformed best guesses stay unknown", async () => {
  for (const blocked of [true, false]) {
    let count = 0;
    const p = new OpenAiAssetIntelligence(models, async (url) => {
      if (String(url).includes("api.openai.com")) {
        if (++count === 1)
          return json({
            status: "completed",
            output: [
              {
                type: "web_search_call",
                action: { sources: [{ url: "https://uae.dubizzle.com/test" }] },
              },
              {
                type: "message",
                content: [{ type: "output_text", text: "Sources" }],
              },
            ],
          });
        return json(
          aiResponse({
            comparables: [
              {
                sourceIndex: 0,
                title: "Dell",
                price: 550,
                currency: "AED",
                priceQuote: "AED 550",
                identityQuote: "Dell Latitude 5440",
                conditionQuote: "Used",
              },
            ],
          }),
        );
      }
      return new Response("Dell Latitude 5440 Used USD 100", {
        status: blocked ? 403 : 200,
        headers: { "Content-Type": "text/html" },
      });
    });
    const result = await p.resale({
      brand: "Dell",
      model: "Latitude 5440",
      specs: "",
      condition: "Unknown",
    });
    assert.equal(result.rangeAED, null);
    assert.equal(result.asOf, null);
    assert.deepEqual(result.comparables, []);
  }
});
test("provider response size and malformed JSON are bounded", async () => {
  await assert.rejects(
    providerJson(
      async () => new Response("x".repeat(200)),
      "https://example.test",
      {},
      100,
    ),
    /too large/,
  );
  await assert.rejects(
    providerJson(
      async () => new Response("not-json"),
      "https://example.test",
      {},
    ),
    /unreadable/,
  );
});
test("Google JWT follows BC pattern, readonly scope, shared token request and expiry refresh", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  let calls = 0;
  let now = 1_800_000_000_000;
  const token = new GoogleServiceAccountToken(
    {
      email: "fictional@test.invalid",
      privateKey: privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
    },
    async (url, init) => {
      calls++;
      assert.equal(url, "https://oauth2.googleapis.com/token");
      const body = new URLSearchParams(String(init?.body));
      const jwt = body.get("assertion")!.split(".");
      assert.ok(
        verify(
          "RSA-SHA256",
          Buffer.from(jwt.slice(0, 2).join(".")),
          publicKey,
          Buffer.from(jwt[2], "base64url"),
        ),
      );
      const claims = JSON.parse(Buffer.from(jwt[1], "base64url").toString());
      assert.equal(
        claims.scope,
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      );
      assert.equal(claims.exp - claims.iat, 3600);
      return json({
        access_token: `fixture-token-${calls}`,
        token_type: "Bearer",
        expires_in: 3600,
      });
    },
    () => now,
  );
  assert.deepEqual(
    await Promise.all([token.accessToken(), token.accessToken()]),
    ["fixture-token-1", "fixture-token-1"],
  );
  assert.equal(calls, 1);
  await token.accessToken();
  assert.equal(calls, 1);
  now += 3_550_000;
  assert.equal(await token.accessToken(), "fixture-token-2");
});

test("controlled Sheet writer atomically persists asset/history/revision/receipt and replays after uncertain acknowledgement", async () => {
  const w = await writerMock();
  const input = { asset: sample(), requestId: randomUUID() };
  w.lose();
  await assert.rejects(
    w.client().commit("create", input, "Fixture Actor"),
    /unconfirmed/,
  );
  const a = await w.client().commit("create", input, "Fixture Actor");
  assert.equal(a.version, 1);
  assert.equal(w.calls(), 1);
  assert.equal(w.tables[0].length, 2);
  assert.equal(w.tables[1].length, 2);
  assert.equal(w.tables[4].length, 2);
  await assert.rejects(
    w
      .client()
      .commit(
        "create",
        { ...input, asset: { ...input.asset, name: "Changed" } },
        "Fixture Actor",
      ),
    /different details/,
  );
  assert.equal(w.calls(), 1);
  await assert.rejects(
    w
      .client()
      .commit("create", { ...input, requestId: randomUUID() }, "Fixture Actor"),
    /serial already exists/,
  );
  assert.equal(w.calls(), 1);
});
test("Sheet expected revisions, full movements and out-of-band fingerprints fail closed", async () => {
  const w = await writerMock();
  const a = await w
    .client()
    .commit(
      "create",
      { asset: sample(), requestId: randomUUID() },
      "Fixture Actor",
    );
  const b = await w.client().commit(
    "move",
    {
      requestId: randomUUID(),
      expectedVersion: 1,
      action: "Assign",
      assignee: "Fixture Person",
      location: "Locker",
      notes: "Complete audit",
    },
    "Fixture Actor",
    a.id,
  );
  assert.equal(b.version, 2);
  const event = JSON.parse(w.tables[4][2][1]);
  assert.equal(event.actor, "Fixture Actor");
  assert.equal(event.from.assignee, "");
  assert.equal(event.to.assignee, "Fixture Person");
  assert.equal(event.to.location, "Locker");
  await assert.rejects(
    w
      .client()
      .commit(
        "edit",
        { requestId: randomUUID(), expectedVersion: 1, asset: sample() },
        "Fixture Actor",
        a.id,
      ),
    /Asset changed/,
  );
  w.tables[0][1][2] = "Manual edit";
  await assert.rejects(
    w.client().commit(
      "move",
      {
        requestId: randomUUID(),
        expectedVersion: 2,
        action: "Return",
        assignee: "",
        location: "Engineering Area",
        notes: "",
      },
      "Fixture Actor",
      a.id,
    ),
    /outside the controlled writer/,
  );
  assert.equal(w.calls(), 2);
});
test("Sheet writer preserves legacy IDs/unknown raw fields/currency/timestamps; photo parts round trip", async () => {
  const w = await writerMock();
  const legacy = inventoryHeaders.map(() => "");
  Object.entries({
    id: "original-id",
    category: "unmapped-kind",
    assetName: "Original name",
    manufacturer: "Legacy",
    model: "Old",
    serialNumber: "ORIG-1",
    cpu: "Unverified original CPU",
    ramGb: "8",
    modelYear: "?",
    purchasePrice: "199.20",
    purchaseCurrency: "JPY",
    condition: "odd-condition",
    status: "odd-status",
    createdAt: "original-time",
    updatedAt: "original-update",
  }).forEach(([k, v]) => {
    legacy[inventoryHeaders.indexOf(k)] = v;
  });
  w.tables[0].push(legacy);
  const a = await w.client().commit(
    "edit",
    {
      requestId: randomUUID(),
      expectedVersion: 1,
      asset: {
        ...sample(),
        name: "Renamed",
        serial: "ORIG-1",
        brand: "Legacy",
        model: "Old",
        category: "Other",
        purchaseCost: "199.20",
        purchaseCurrency: "JPY",
        photos: ["data:image/png;base64," + "A".repeat(90_000)],
      },
    },
    "Fixture Actor",
    "original-id",
  );
  assert.equal(a.id, "original-id");
  assert.equal(a.createdAt, "original-time");
  assert.equal(w.tables[0][1][1], "unmapped-kind");
  assert.equal(w.tables[0][1][6], "Unverified original CPU");
  assert.equal(w.tables[0][1][9], "?");
  assert.equal(w.tables[0][1][11], "JPY");
  assert.equal(w.tables[0][1][13], "odd-condition");
  const parts = w.tables[3]
    .slice(1)
    .filter((row) => row[0] === a.id)
    .sort((x, y) => Number(x[2]) - Number(y[2]));
  assert.ok(parts.length > 1);
  assert.ok(parts.every((row) => row[3].length <= 44_000));
  assert.equal(
    JSON.parse(parts.map((row) => row[3]).join("")).asset.photos[0],
    a.photos[0],
  );
  const reader = new ControlledSheetReader(
    "fictional",
    async () => "fixture-token",
    async (url, init) => {
      assert.match(String(url), /values:batchGet/);
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer fixture-token",
      );
      return json({
        valueRanges: w.tables.slice(0, 5).map((values) => ({ values })),
      });
    },
  );
  const snapshot = await reader.snapshot();
  assert.equal(snapshot.assets[0].photos[0], a.photos[0]);
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.history[0].actor, "Fixture Actor");
  assert.equal(snapshot.assets[0].purchaseCurrency, "JPY");
  w.tables[3][1][2] = "missing-part";
  assert.throws(
    () => decodeControlledSnapshot(w.tables.slice(0, 5)),
    /parts require review/,
  );
});
test("controlled writer rejects missing schema, busy lock, disabled configuration, and unverifiable receipts", async () => {
  const data = { asset: sample(), requestId: randomUUID() };
  for (const mutate of [
    (w: Awaited<ReturnType<typeof writerMock>>) => {
      w.tables[0][0][0] = "Wrong";
    },
    (w: Awaited<ReturnType<typeof writerMock>>) => w.busy(),
    (w: Awaited<ReturnType<typeof writerMock>>) => w.disable(),
  ]) {
    const w = await writerMock();
    mutate(w);
    await assert.rejects(w.client().commit("create", data, "Fixture Actor"));
    assert.equal(w.calls(), 0);
  }
  const wrong = new ControlledSheetGateway(
    {
      url: "https://script.google.com/macros/s/fictional/exec",
      signingSecret: "fixture-secret-32-characters-only",
      spreadsheetId: "fictional-sheet",
    },
    async () => json({ ok: true }),
  );
  await assert.rejects(
    wrong.commit("create", data, "Fixture Actor"),
    /verifiable receipt/,
  );
});
test("durable pending intent blocks ALL later commands after script termination or lost intent acknowledgement", async () => {
  for (const stage of ["final", "intent"]) {
    const w = await writerMock();
    const data = { asset: sample(), requestId: randomUUID() };
    if (stage === "final") w.suspend();
    else w.loseIntent();
    await assert.rejects(
      w.client().commit("create", data, "Fixture Actor"),
      /unconfirmed/,
    );
    await assert.rejects(
      w.client().commit("create", data, "Fixture Actor"),
      /Reconciliation/,
    );
    await assert.rejects(
      w.client().commit(
        "create",
        {
          asset: { ...sample(), serial: "OTHER-1" },
          requestId: randomUUID(),
        },
        "Fixture Actor",
      ),
      /paused for reconciliation/,
    );
    assert.equal(w.calls(), 0);
    assert.equal(w.tables[0].length, 1);
    assert.equal(w.tables[1].length, 1);
    assert.equal(w.tables[4].length, 1);
  }
});
test("a gateway targeting a different Sheet rejects the command without changing any table", async () => {
  const writer = await writerMock();
  const before = structuredClone(writer.tables);
  const client = new ControlledSheetGateway(
    {
      url: "https://script.google.com/macros/s/fictional/exec",
      signingSecret: "fixture-secret-32-characters-only",
      spreadsheetId: "different-fictional-sheet",
    },
    writer.fetcher,
  );
  await assert.rejects(
    client.commit(
      "create",
      { asset: sample(), requestId: randomUUID() },
      "Fixture Actor",
    ),
    /different Sheet/,
  );
  assert.deepEqual(writer.tables, before);
  assert.equal(writer.calls(), 0);
});
test("distinct server clients share writer identity checks; formula-looking text remains literal", async () => {
  const w = await writerMock();
  const attempts = await Promise.allSettled([
    w.client().commit(
      "create",
      {
        asset: {
          ...sample(),
          notes: '=IMPORTXML("https://fictional.invalid","//x")',
        },
        requestId: randomUUID(),
      },
      "Fixture Actor",
    ),
    w
      .client()
      .commit(
        "create",
        { asset: { ...sample(), serial: " new-1 " }, requestId: randomUUID() },
        "Fixture Actor",
      ),
  ]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(w.calls(), 1);
  assert.equal(w.tables[0].length, 2);
  assert.equal(
    w.tables[0][1][16],
    '=IMPORTXML("https://fictional.invalid","//x")',
  );
});

test("resale accepts independently verified UAE renewed product prices with configuration limits and excludes other country/unsafe hosts", async () => {
  let calls = 0;
  const fetched: string[] = [];
  const provider = new OpenAiAssetIntelligence(models, async (url, init) => {
    if (String(url) === "https://api.openai.com/v1/responses") {
      const body = JSON.parse(String(init?.body));
      if (++calls === 1) {
        assert.equal(body.tool_choice, "required");
        assert.deepEqual(body.tools[0].filters.allowed_domains, ["revibe.me"]);
        return json({
          status: "completed",
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { url: "https://sa.revibe.me/products/dell" },
                  { url: "https://revibe.me.evil.test/products/dell" },
                  { url: "https://revibe.me/collections/laptops" },
                ],
              },
            },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "Cited verified UAE product",
                  annotations: [
                    {
                      type: "url_citation",
                      url: "https://www.revibe.me/products/dell-latitude-7400",
                    },
                  ],
                },
              ],
            },
          ],
        });
      }
      return json(
        aiResponse({
          comparables: [
            {
              sourceIndex: 0,
              title: "Dell",
              price: 959,
              currency: "AED",
              priceQuote: "AED 959",
              identityQuote: "Dell Latitude 7400",
              conditionQuote: "Certified Renewed",
            },
          ],
        }),
      );
    }
    fetched.push(String(url));
    return new Response(
      "<h1>Dell Latitude 7400</h1><p>Certified Renewed</p><p>AED 959</p>",
      { headers: { "Content-Type": "text/html" } },
    );
  });
  const result = await provider.resale({
    brand: "Dell",
    model: "Latitude 7400",
    specs: "i7 / 16 GB RAM / 512 GB storage",
    condition: "Unknown",
  });
  assert.deepEqual(fetched, [
    "https://www.revibe.me/products/dell-latitude-7400",
  ]);
  assert.deepEqual(result.rangeAED, { low: 959, high: 959 });
  assert.equal(result.comparables[0].condition, "Certified Renewed");
  assert.ok(
    result.limitations.some((text) =>
      text.includes("configurations may differ"),
    ),
  );
  assert.ok(result.limitations.some((text) => text.includes("retailer")));
});

test("missing current sources can produce a clearly separate low-confidence model estimate without fabricating comparables", async () => {
  let calls = 0;
  const provider = new OpenAiAssetIntelligence(
    models,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (++calls === 1)
        return json(aiResponse("No matching readable listings"));
      assert.equal(body.text.format.name, "indicative_resale");
      assert.equal(body.model, models.searchModel);
      assert.match(body.instructions, /LOW CONFIDENCE MODEL ESTIMATE/);
      assert.match(body.instructions, /Return no URLs or comparables/);
      assert.deepEqual(JSON.parse(body.input), {
        brand: "Dell",
        model: "Latitude 5440",
        specs: "Unknown",
        condition: "Unknown",
      });
      return json(
        aiResponse({
          goodWorkingAED: { low: 600, high: 900 },
          reasoning:
            "Broad model-family planning estimate; RAM and storage are unknown.",
          assumptions: [
            "Assumes fully working equipment; condition is not verified.",
          ],
        }),
      );
    },
    () => new Date("2026-10-06T00:00:00Z"),
  );
  const result = await provider.resale({
    brand: "Dell",
    model: "Latitude 5440",
    specs: "Unknown",
    condition: "Unknown",
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.comparables, []);
  assert.equal(result.rangeAED, null);
  assert.equal(result.asOf, null);
  assert.deepEqual(result.indicative?.goodWorkingAED, { low: 600, high: 900 });
  assert.equal(result.indicative?.basis, "model-estimate");
  assert.equal(result.indicative?.estimatedAt, "2026-10-06T00:00:00.000Z");
});
test("unfamiliar identity, reversed estimate and provider failure keep prices unknown rather than inventing an anchor", async () => {
  for (const answer of [null, { low: 900, high: 600 }, "failure"]) {
    let calls = 0;
    const provider = new OpenAiAssetIntelligence(models, async () => {
      if (++calls === 1) return json(aiResponse("No sources"));
      if (answer === "failure")
        return json({ error: { message: "Rate limited" } }, 429);
      return json(
        aiResponse({
          goodWorkingAED: answer,
          reasoning: "Identity uncertain",
          assumptions: [],
        }),
      );
    });
    const result = await provider.resale({
      brand: "Unknown",
      model: "Unknown",
      specs: "",
      condition: "Unknown",
    });
    assert.equal(result.indicative, undefined);
    assert.equal(result.rangeAED, null);
    assert.deepEqual(result.comparables, []);
    assert.equal(calls, 2);
  }
});
