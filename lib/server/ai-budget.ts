import "server-only";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { StoreError } from "./store";
import { ProviderError } from "./provider-http";
import { sharedCoordination, reserveHostedAiRequest } from "./hosted-coordination";
const stateSchema = z
  .object({
    day: z.string(),
    minute: z.number(),
    daily: z.number().int().nonnegative(),
    recent: z.number().int().nonnegative(),
  })
  .strict();
// Reserve each paid HTTP attempt before transmission; failed attempts count too.
// Shared local filesystem lock, not a distributed hosting quota or AED estimate.
export async function reserveAiRequest(
  directory = path.join(process.cwd(), ".local"),
  limits = { daily: 20, minute: 4 },
  now = Date.now(),
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, "ai-budget.lock");
  try {
    await mkdir(lock);
  } catch {
    throw new StoreError(
      "AI budget is busy or requires recovery. No provider request was sent.",
      429,
    );
  }
  let temporary: string | undefined;
  try {
    const day = new Date(now).toISOString().slice(0, 10),
      minute = Math.floor(now / 60_000);
    let saved = { day, minute, daily: 0, recent: 0 };
    try {
      saved = stateSchema.parse(
        JSON.parse(
          await readFile(path.join(directory, "ai-budget.json"), "utf8"),
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new StoreError(
          "AI budget record requires review. No provider request was sent.",
          503,
        );
    }
    const daily = saved.day === day ? saved.daily : 0,
      recent = saved.minute === minute ? saved.recent : 0;
    if (daily >= limits.daily || recent >= limits.minute)
      throw new StoreError(
        "The local AI request allowance has been reached. Continue manually or retry in the next allowance window.",
        429,
      );
    temporary = path.join(directory, `${randomUUID()}.budget.tmp`);
    await writeFile(
      temporary,
      JSON.stringify({ day, minute, daily: daily + 1, recent: recent + 1 }),
      { flag: "wx", mode: 0o600 },
    );
    await rename(temporary, path.join(directory, "ai-budget.json"));
  } finally {
    if (temporary) await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
function boundedLimit(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= maximum
    ? number
    : fallback;
}
export const budgetedFetch: typeof fetch = async (url, init) => {
  try {
    const limits = {
      daily: boundedLimit(
        process.env.HC_ASSETS_AI_DAILY_REQUEST_LIMIT,
        20,
        100,
      ),
      minute: boundedLimit(
        process.env.HC_ASSETS_AI_MINUTE_REQUEST_LIMIT,
        4,
        20,
      ),
    };
    if (sharedCoordination()) await reserveHostedAiRequest(limits);
    else await reserveAiRequest(undefined, limits);
  } catch (e) {
    if (e instanceof StoreError)
      throw new ProviderError(
        e.status === 429 ? "limit" : "configuration",
        e.message,
      );
    throw e;
  }
  return fetch(url, init);
};
