import "server-only";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StoreError } from "./store";

export interface CoordinationStorage {
  read(key: string): Promise<{ value: unknown; etag: string } | null>;
  write(key: string, value: unknown, etag?: string): Promise<string>;
}
export const blobCoordination: CoordinationStorage = {
  async read(key) {
    const result = await get(key, { access: "private", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200 || result.blob.size > 10_000)
      throw new StoreError("The hosted coordination record needs review.", 503);
    return {
      value: await new Response(result.stream).json(),
      etag: result.blob.etag,
    };
  },
  async write(key, value, etag) {
    const result = await put(key, JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
      allowOverwrite: !!etag,
      ...(etag ? { ifMatch: etag } : {}),
    });
    return result.etag;
  },
};
const mutexSchema = z
  .object({ owner: z.string().nullable(), changedAt: z.string().datetime() })
  .strict();
const quotaSchema = z
  .object({
    day: z.string(),
    minute: z.number().int(),
    daily: z.number().int().nonnegative(),
    recent: z.number().int().nonnegative(),
  })
  .strict();
export const hosted = () => process.env.VERCEL_ENV === "production";

// A durable, non-expiring mutex. A terminated holder requires reconciliation;
// another instance never steals its lock while a Sheet request may still run.
export async function acquireHostedWriter(
  storage: CoordinationStorage = blobCoordination,
) {
  const key = "coordination/sheet-writer.json";
  const current = await storage.read(key);
  if (current && mutexSchema.parse(current.value).owner !== null)
    throw new StoreError(
      "Another save is running or needs recovery. Keep your draft and retry the same save reference.",
      503,
    );
  const owner = randomUUID();
  let etag: string;
  try {
    etag = await storage.write(
      key,
      { owner, changedAt: new Date().toISOString() },
      current?.etag,
    );
  } catch {
    throw new StoreError(
      "The hosted writer could not be reserved. No Sheet request was sent.",
      503,
    );
  }
  return async () => {
    // Conditional release cannot overwrite a different holder's state.
    try {
      await storage.write(
        key,
        { owner: null, changedAt: new Date().toISOString() },
        etag,
      );
    } catch {
      // The confirmed Sheet receipt remains authoritative. Leave the mutex
      // locked for operator review instead of reporting a false failed save.
      console.error("HCAssets writer mutex release needs recovery.");
    }
  };
}

export async function reserveHostedAiRequest(
  limits: { daily: number; minute: number },
  storage: CoordinationStorage = blobCoordination,
  now = Date.now(),
) {
  const day = new Date(now).toISOString().slice(0, 10),
    minute = Math.floor(now / 60_000);
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await storage.read("coordination/ai-budget.json");
    const saved = current
      ? quotaSchema.parse(current.value)
      : { day, minute, daily: 0, recent: 0 };
    const daily = saved.day === day ? saved.daily : 0;
    const recent = saved.minute === minute ? saved.recent : 0;
    if (daily >= limits.daily || recent >= limits.minute)
      throw new StoreError(
        "The AI request allowance has been reached. Continue manually or retry in the next allowance window.",
        429,
      );
    try {
      await storage.write(
        "coordination/ai-budget.json",
        { day, minute, daily: daily + 1, recent: recent + 1 },
        current?.etag,
      );
      return;
    } catch (error) {
      // Only a confirmed precondition rejection is safe to retry. An unknown
      // result consumes no paid request and requires explicit user retry.
      if (!(error instanceof BlobPreconditionFailedError))
        throw new StoreError(
          "The hosted AI allowance could not be confirmed. No provider request was sent.",
          503,
        );
    }
  }
  throw new StoreError(
    "The AI allowance is busy. No provider request was sent.",
    429,
  );
}
