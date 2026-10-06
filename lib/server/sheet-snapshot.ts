import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Snapshot } from "../model";
import {
  decodeEmployees,
  decodeHistory,
  decodeInventory,
  inventoryHeaders,
  historyHeaders,
} from "./sheets";
import { storedAsset } from "./sheet-gateway";
import { ProviderError, providerJson } from "./provider-http";
const movement = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    action: z.string(),
    actor: z.string(),
    at: z.string(),
    from: z.object({
      assignee: z.string(),
      location: z.string(),
      status: z.string(),
    }),
    to: z.object({
      assignee: z.string(),
      location: z.string(),
      status: z.string(),
    }),
    notes: z.string(),
  })
  .strict();
const savedRecord = z
  .object({
    asset: storedAsset,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const controlledTabs = [
  "Inventory",
  "assignment_history",
  "Employees",
  "HCAssets_records",
  "HCAssets_movements",
] as const;
export function decodeControlledSnapshot(tables: unknown[][][]): Snapshot {
  if (tables.length !== controlledTabs.length)
    throw new ProviderError(
      "invalid_response",
      "The Sheet snapshot is incomplete.",
    );
  const expected = [
    inventoryHeaders,
    historyHeaders,
    ["name", "department"],
    ["id", "version", "part", "json"],
    ["id", "json"],
  ];
  tables.forEach((table, i) => {
    // Exact schemas are reviewed/provisioned later. Never auto-change live headers.
    if (JSON.stringify(table[0]) !== JSON.stringify(expected[i]))
      throw new ProviderError(
        "configuration",
        "The Sheet schema needs review.",
      );
  });
  const assets = decodeInventory(tables[0]);
  const groups = new Map<string, string[][]>();
  for (const row of tables[3].slice(1)) {
    if (!row[0]) {
      if (row.some(Boolean))
        throw new ProviderError(
          "invalid_response",
          "A Sheet record part has no ID.",
        );
      continue;
    }
    const cells = row.map((v) => String(v ?? ""));
    const parts = groups.get(cells[0]) || [];
    parts.push(cells);
    groups.set(cells[0], parts);
  }
  for (const [id, parts] of groups) {
    const index = assets.findIndex((a) => a.id === id);
    if (index < 0)
      throw new ProviderError(
        "invalid_response",
        "Sheet metadata refers to a missing asset.",
      );
    parts.sort((a, b) => Number(a[2]) - Number(b[2]));
    if (parts.some((p, i) => Number(p[2]) !== i || p[1] !== parts[0][1]))
      throw new ProviderError(
        "invalid_response",
        "Sheet record parts require review.",
      );
    let saved: z.infer<typeof savedRecord>;
    try {
      saved = savedRecord.parse(JSON.parse(parts.map((p) => p[3]).join("")));
    } catch {
      throw new ProviderError(
        "invalid_response",
        "Sheet metadata is unreadable.",
      );
    }
    const row = tables[0].slice(1).find((r) => r[0] === id);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(row))
      .digest("hex");
    if (
      saved.asset.id !== id ||
      saved.asset.version !== Number(parts[0][1]) ||
      saved.fingerprint !== fingerprint
    )
      throw new ProviderError(
        "invalid_response",
        "The Sheet changed outside the controlled writer. Review required.",
      );
    assets[index] = saved.asset;
  }
  const full = tables[4]
    .slice(1)
    .filter((r) => r.some(Boolean))
    .map((row) => {
      try {
        const event = movement.parse(JSON.parse(String(row[1])));
        if (event.id !== row[0]) throw new Error("ID mismatch");
        return event;
      } catch {
        throw new ProviderError(
          "invalid_response",
          "Full Sheet movement history requires review.",
        );
      }
    });
  if (new Set(full.map((e) => e.id)).size !== full.length)
    throw new ProviderError(
      "invalid_response",
      "Duplicate movement IDs require review.",
    );
  const ids = new Set(full.map((e) => e.id));
  return {
    assets,
    people: decodeEmployees(tables[2]),
    history: [
      ...full,
      ...decodeHistory(tables[1]).filter((e) => !ids.has(e.id)),
    ].sort((a, b) => b.at.localeCompare(a.at)),
  };
}
// Optional reviewed-sidecar reader; preview never selects it. One batch read,
// fingerprint validation, and full movements supersede corresponding legacy rows.
export class ControlledSheetReader {
  constructor(
    private spreadsheetId: string,
    private token: () => Promise<string>,
    private fetcher: typeof fetch = fetch,
  ) {}
  async snapshot(): Promise<Snapshot> {
    const query = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
    controlledTabs.forEach((tab) => query.append("ranges", `'${tab}'!A:ZZ`));
    const response = await providerJson(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values:batchGet?${query}`,
      { headers: { Authorization: `Bearer ${await this.token()}` } },
      20_000_000,
    );
    const data = z
      .object({
        valueRanges: z.array(
          z.object({
            values: z
              .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
              .optional(),
          }),
        ),
      })
      .safeParse(response);
    if (!data.success)
      throw new ProviderError(
        "invalid_response",
        "The Sheet snapshot response was invalid.",
      );
    return decodeControlledSnapshot(
      data.data.valueRanges.map((r) => r.values || []),
    );
  }
}
