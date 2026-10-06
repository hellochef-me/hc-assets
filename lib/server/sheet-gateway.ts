import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  assetInput,
  createInput,
  editInput,
  movementInput,
  statuses,
  type Asset,
} from "../model";
import { ProviderError, providerJson } from "./provider-http";
// Persisted legacy fields may be unverified and currencies/cost strings unknown.
export const storedAsset = z
  .object({
    ...assetInput.shape,
    location: z.string().max(400),
    purchaseCost: z.string().max(400),
    purchaseDate: z.string().max(400),
    id: z.string().min(1).max(400),
    version: z.number().int().positive(),
    status: z.enum(statuses),
    assignee: z.string().max(400),
    createdAt: z.string().max(100),
    updatedAt: z.string().max(100),
    raw: z.record(z.string(), z.string()).optional(),
    mergedIntoId: z.string().min(1).max(400).optional(),
    mergedFromIds: z.array(z.string().min(1).max(400)).optional(),
  })
  .strict();
const result = storedAsset;
const envelope = z
  .object({
    payload: z.string().max(4_000_000),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const answer = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    requestId: z.string().uuid(),
    asset: result,
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum([
      "configuration",
      "conflict",
      "duplicate",
      "invalid",
      "busy",
      "uncertain",
    ]),
    message: z.string().max(200),
  }),
]);
export class SheetGatewayError extends Error {
  constructor(
    public code: string,
    message: string,
    public assetId?: string,
  ) {
    super(message);
  }
}
// Instantiated only by approved isolated staging routes. Production integration
// must supply authenticated actor identity. The gateway is the sole writer.
export class ControlledSheetGateway {
  constructor(
    private config: {
      url: string;
      signingSecret: string;
      spreadsheetId: string;
    },
    private fetcher: typeof fetch = fetch,
    private clock = () => new Date(),
  ) {
    const url = new URL(config.url);
    z.string().min(1).max(200).parse(config.spreadsheetId);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) ||
      config.signingSecret.length < 32
    )
      throw new ProviderError(
        "configuration",
        "The controlled Sheet gateway is not configured.",
      );
  }
  async commit(
    action: "create" | "edit" | "move",
    input: unknown,
    actor: string,
    assetId?: string,
  ): Promise<Asset> {
    const data =
      action === "create"
        ? createInput.parse(input)
        : action === "edit"
          ? editInput.parse(input)
          : movementInput.parse(input);
    z.string().trim().min(1).max(200).parse(actor);
    if (action !== "create") z.string().min(1).max(400).parse(assetId);
    const payload = JSON.stringify({
      action,
      spreadsheetId: this.config.spreadsheetId,
      data,
      actor,
      ...(assetId ? { assetId } : {}),
      issuedAt: this.clock().toISOString(),
    });
    const signature = createHmac("sha256", this.config.signingSecret)
      .update(payload)
      .digest("hex");
    let response: unknown;
    try {
      response = await providerJson(
        this.fetcher,
        this.config.url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload, signature }),
          redirect: "follow",
        },
        4_000_000,
      );
    } catch {
      throw new ProviderError(
        "uncertain_write",
        "The Sheet write is unconfirmed. Retry the same request ID and unchanged details.",
      );
    }
    const wrapped = envelope.safeParse(response);
    if (!wrapped.success)
      throw new ProviderError(
        "uncertain_write",
        "The Sheet returned no verifiable receipt. Retry the same request ID.",
      );
    const expected = createHmac("sha256", this.config.signingSecret)
      .update(wrapped.data.payload)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(wrapped.data.signature, "hex")))
      throw new ProviderError(
        "uncertain_write",
        "The Sheet receipt could not be verified.",
      );
    let parsed: z.infer<typeof answer>;
    try {
      parsed = answer.parse(JSON.parse(wrapped.data.payload));
    } catch {
      throw new ProviderError(
        "uncertain_write",
        "The Sheet receipt was unreadable.",
      );
    }
    if (!parsed.ok) throw new SheetGatewayError(parsed.code, parsed.message);
    if (parsed.requestId !== data.requestId)
      throw new ProviderError(
        "uncertain_write",
        "The Sheet receipt belongs to another request.",
      );
    return parsed.asset as Asset;
  }
}
