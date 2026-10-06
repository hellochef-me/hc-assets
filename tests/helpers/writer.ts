import { createHmac, createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { inventoryHeaders, historyHeaders } from "../../lib/server/sheets";
import { ControlledSheetGateway } from "../../lib/server/sheet-gateway";
type BatchRequest = {
  appendCells?: {
    sheetId: number;
    rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
  };
  updateCells?: {
    start: { sheetId: number; rowIndex: number };
    rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
  };
};
export async function writerMock() {
  const names = [
    "Inventory",
    "assignment_history",
    "Employees",
    "HCAssets_records",
    "HCAssets_movements",
    "HCAssets_commands",
  ];
  const tables: string[][][] = [
    [[...inventoryHeaders]],
    [[...historyHeaders]],
    [
      ["name", "department"],
      ["Fixture Person", "Demo"],
    ],
    [["id", "version", "part", "json"]],
    [["id", "json"]],
    [["requestId", "digest", "part", "json"]],
  ];
  let calls = 0;
  let loseResponse = false;
  let suspendFinal = false;
  let loseIntent = false;
  let busy = false;
  let enabled = true;
  const secret = "fixture-secret-32-characters-only";
  const context = vm.createContext({
    Date,
    Number,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) =>
          ({
            HC_ASSETS_GATEWAY_SECRET: secret,
            HC_ASSETS_WRITE_ENABLED: enabled ? "approved" : "",
            HC_ASSETS_SPREADSHEET_ID: "fictional-sheet",
          })[key as "HC_ASSETS_GATEWAY_SECRET"],
      }),
    },
    LockService: {
      getScriptLock: () => {
        let locked = false;
        return {
          tryLock: () => {
            locked = !busy;
            return locked;
          },
          hasLock: () => locked,
          releaseLock: () => {
            locked = false;
          },
        };
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (body: string) => ({ setMimeType: () => body }),
    },
    Utilities: {
      Charset: { UTF_8: "utf8" },
      DigestAlgorithm: { SHA_256: "sha256" },
      getUuid: randomUUID,
      computeHmacSha256Signature: (text: string, key: string) => [
        ...createHmac("sha256", key).update(text).digest(),
      ],
      computeDigest: (_: string, text: string) => [
        ...createHash("sha256").update(text).digest(),
      ],
    },
    Sheets: {
      Spreadsheets: {
        Values: {
          batchGet: () => ({
            valueRanges: tables.map((values) => ({
              values: structuredClone(values),
            })),
          }),
        },
        get: () => ({
          sheets: names.map((title, sheetId) => ({
            properties: { title, sheetId },
          })),
        }),
        batchUpdate: (body: { requests: BatchRequest[] }) => {
          const domainWrite = body.requests.some(
            (r) =>
              r.appendCells?.sheetId === 0 ||
              r.updateCells?.start.sheetId === 0,
          );
          if (domainWrite && suspendFinal) {
            suspendFinal = false;
            throw new Error("script terminated before acknowledgement");
          }
          // Model all-or-nothing batch application, then optionally lose acknowledgement.
          const next = structuredClone(tables);
          for (const request of body.requests) {
            if (request.appendCells) {
              const r = request.appendCells;
              next[r.sheetId].push(
                ...r.rows.map((row) =>
                  row.values.map((c) => c.userEnteredValue.stringValue),
                ),
              );
            }
            if (request.updateCells) {
              const r = request.updateCells;
              next[r.start.sheetId][r.start.rowIndex] = r.rows[0].values.map(
                (c) => c.userEnteredValue.stringValue,
              );
            }
          }
          next.forEach((rows, i) => {
            tables[i] = rows;
          });
          if (domainWrite) calls++;
          if ((domainWrite && loseResponse) || (!domainWrite && loseIntent)) {
            loseResponse = false;
            loseIntent = false;
            throw new Error("lost acknowledgement");
          }
        },
      },
    },
  });
  vm.runInContext(
    await readFile(
      new URL("../../integrations/controlled-writer.gs", import.meta.url),
      "utf8",
    ),
    context,
  );
  const execute = context.doPost as (e: {
    postData: { contents: string };
  }) => string;
  const fetcher: typeof fetch = async (_url, init) =>
    new Response(execute({ postData: { contents: String(init?.body) } }), {
      headers: { "Content-Type": "application/json" },
    });
  const client = () =>
    new ControlledSheetGateway(
      {
        url: "https://script.google.com/macros/s/fictional/exec",
        signingSecret: secret,
        spreadsheetId: "fictional-sheet",
      },
      fetcher,
    );
  return {
    tables,
    fetcher,
    restFetcher: (async (url, init) => {
      const target = new URL(String(url));
      const api = context.Sheets as {
        Spreadsheets: {
          get: () => unknown;
          Values: { batchGet: () => { valueRanges: { values: string[][] }[] } };
          batchUpdate: (body: unknown) => unknown;
        };
      };
      if (target.pathname.endsWith("/values:batchGet")) {
        const result = api.Spreadsheets.Values.batchGet();
        return Response.json({
          valueRanges: result.valueRanges.slice(
            0,
            target.searchParams.getAll("ranges").length,
          ),
        });
      }
      if (target.pathname.endsWith(":batchUpdate")) {
        api.Spreadsheets.batchUpdate(JSON.parse(String(init?.body)));
        return Response.json({ replies: [] });
      }
      return Response.json(api.Spreadsheets.get());
    }) as typeof fetch,
    client,
    calls: () => calls,
    lose: () => {
      loseResponse = true;
    },
    suspend: () => {
      suspendFinal = true;
    },
    loseIntent: () => {
      loseIntent = true;
    },
    busy: () => {
      busy = true;
    },
    disable: () => {
      enabled = false;
    },
  };
}
