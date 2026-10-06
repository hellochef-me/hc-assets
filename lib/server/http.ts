import "server-only";
import { ZodError } from "zod";
import { StoreError } from "./store";
import { ProviderError } from "./provider-http";
import { SheetGatewayError } from "./sheet-gateway";
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function guard(request: Request) {
  const u = new URL(request.url);
  // Next may construct an internal localhost URL for a 127.0.0.1 request.
  // Validate the actual Host header as well and compare Origin to that host.
  const incoming = new URL(
    `${u.protocol}//${request.headers.get("host") || u.host}`,
  );
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(incoming.hostname) ||
    (request.headers
      .get("x-forwarded-for")
      ?.split(",")
      .some(
        (ip) => !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip.trim()),
      ) ??
      false) ||
    request.headers.has("x-vercel-id")
  )
    throw new StoreError(
      "This demo is available only in the private local preview.",
      403,
    );
  if (process.env.HC_ASSETS_MODE && process.env.HC_ASSETS_MODE !== "demo")
    throw new StoreError(
      "Live inventory is disabled pending integration approval and authentication.",
      503,
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== incoming.origin)
    throw new StoreError("Invalid request origin.", 403);
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new StoreError("Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new StoreError("Missing request.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 3000000) {
      await reader.cancel();
      throw new StoreError("Photos are too large. Use smaller images.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new StoreError("Invalid request JSON.");
  }
}
export function failure(e: unknown) {
  if (e instanceof ZodError)
    return json({ error: e.issues[0]?.message || "Invalid request." }, 400);
  if (e instanceof StoreError)
    return json({ error: e.message, assetId: e.assetId }, e.status);
  if (e instanceof ProviderError)
    return json({ error: e.message }, e.code === "limit" ? 429 : 503);
  if (e instanceof SheetGatewayError)
    return json(
      { error: e.message },
      ["duplicate", "conflict"].includes(e.code)
        ? 409
        : e.code === "invalid"
          ? 400
          : 503,
    );
  return json(
    {
      error:
        "The save could not be confirmed. Your draft is preserved; retry with the same save reference.",
    },
    503,
  );
}
