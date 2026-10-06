import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createSheetCommandCore } from "./sheet-command-core.mjs";
import { createInput, editInput, movementInput, type Asset } from "../model";
import { storedAsset, SheetGatewayError } from "./sheet-gateway";
import { ProviderError, providerJson } from "./provider-http";

// BC-style REST transport using an existing approved server identity. This local
// writer needs no deployed Apps Script gateway or new signing secret. Its shared
// filesystem lock coordinates processes on THIS Mac only. Exclusive ownership
// is required; other computers/scripts/manual Sheet edits are outside the lock.
export class DirectSheetWriter {
  constructor(
    private spreadsheetId: string,
    private token: () => Promise<string>,
    private fetcher: typeof fetch = fetch,
    private directory = path.join(process.cwd(), ".local"),
    private sharedLock?: () => Promise<() => Promise<void>>,
  ) {
    if (!spreadsheetId)
      throw new ProviderError("configuration", "The Sheet ID is missing.");
  }
  async commit(
    action: "create" | "edit" | "move",
    input: unknown,
    actor: string,
    assetId?: string,
  ): Promise<Asset> {
    const data = (
      action === "create"
        ? createInput
        : action === "edit"
          ? editInput
          : movementInput
    ).parse(input);
    if (
      !actor.trim() ||
      actor.length > 200 ||
      (action !== "create" && !assetId)
    )
      throw new SheetGatewayError(
        "invalid",
        "Invalid writer identity or asset reference.",
      );
    let release: () => Promise<void>;
    if (this.sharedLock) {
      release = await this.sharedLock();
    } else {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const lock = path.join(
        this.directory,
        `sheet-writer-${createHash("sha256").update(this.spreadsheetId).digest("hex").slice(0, 20)}.lock`,
      );
      try {
        await mkdir(lock);
      } catch {
        throw new SheetGatewayError(
          "busy",
          "The local writer is busy or needs recovery. Retry the same request ID.",
        );
      }
      release = () => rm(lock, { recursive: true, force: true });
    }
    try {
      const accessToken = await this.token();
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}`;
      const request = (suffix: string, body?: unknown) =>
        providerJson(
          this.fetcher,
          base + suffix,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
          },
          20_000_000,
        );
      const Sheets = {
        Spreadsheets: {
          Values: {
            batchGet: async (
              _id: string,
              options: { ranges: string[]; valueRenderOption: string },
            ) => {
              const query = new URLSearchParams({
                valueRenderOption: options.valueRenderOption,
              });
              options.ranges.forEach((range) => query.append("ranges", range));
              return request(`/values:batchGet?${query}`);
            },
          },
          get: async () => request("?fields=sheets.properties"),
          batchUpdate: async (body: unknown) => {
            try {
              return await request(":batchUpdate", body);
            } catch {
              throw new SheetGatewayError(
                "uncertain",
                "The Sheet write is unconfirmed. Retry the same request ID and unchanged details; a pending intent requires reconciliation.",
              );
            }
          },
        },
      };
      const Utilities = {
        getUuid: randomUUID,
        DigestAlgorithm: { SHA_256: "sha256" },
        Charset: { UTF_8: "utf8" },
        computeDigest: (_algorithm: string, text: string) => [
          ...createHash("sha256").update(text).digest(),
        ],
      };
      const commit = createSheetCommandCore({ Sheets, Utilities });
      try {
        return storedAsset.parse(
          await commit(
            { action, data, actor, assetId, spreadsheetId: this.spreadsheetId },
            this.spreadsheetId,
          ),
        );
      } catch (error) {
        if (
          error instanceof ProviderError ||
          error instanceof SheetGatewayError
        )
          throw error;
        const code = (error as { writerCode?: string }).writerCode;
        if (code)
          throw new SheetGatewayError(
            code,
            (error as Error).message,
            (error as { assetId?: string }).assetId,
          );
        throw new SheetGatewayError(
          "uncertain",
          "The Sheet result could not be confirmed. Preserve the same request ID for reconciliation.",
        );
      }
    } finally {
      await release();
    }
  }
}
