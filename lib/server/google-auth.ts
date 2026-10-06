import "server-only";
import { createSign } from "node:crypto";
import { z } from "zod";
import { ProviderError, providerJson } from "./provider-http";
const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().min(120).max(3600),
});
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
// Matches BC's server JWT/token-cache pattern. Construction never fetches a token.
export class GoogleServiceAccountToken {
  private cached?: { token: string; until: number };
  private pending?: Promise<string>;
  constructor(
    private config: {
      email: string;
      privateKey: string;
      scope?: "readonly" | "readwrite";
    },
    private fetcher: typeof fetch = fetch,
    private clock = () => Date.now(),
  ) {}
  async accessToken(): Promise<string> {
    if (this.cached && this.cached.until > this.clock())
      return this.cached.token;
    if (this.pending) return this.pending;
    this.pending = this.issue();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async issue() {
    if (!this.config.email || !this.config.privateKey)
      throw new ProviderError(
        "configuration",
        "Server Sheet credentials are missing.",
      );
    const now = Math.floor(this.clock() / 1000);
    const audience = "https://oauth2.googleapis.com/token";
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: this.config.email, scope: this.config.scope === "readwrite" ? "https://www.googleapis.com/auth/spreadsheets" : "https://www.googleapis.com/auth/spreadsheets.readonly", aud: audience, iat: now, exp: now + 3600 })}`;
    let assertion: string;
    try {
      const signer = createSign("RSA-SHA256");
      signer.update(unsigned);
      signer.end();
      assertion = `${unsigned}.${signer.sign(this.config.privateKey.replaceAll("\\n", "\n"), "base64url")}`;
    } catch {
      throw new ProviderError(
        "configuration",
        "The server Sheet signing key is invalid.",
      );
    }
    const response = await providerJson(
      this.fetcher,
      audience,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
      },
      32_000,
    );
    const parsed = tokenSchema.safeParse(response);
    if (!parsed.success)
      throw new ProviderError(
        "invalid_response",
        "The Sheet token response was invalid.",
      );
    this.cached = {
      token: parsed.data.access_token,
      until: this.clock() + (parsed.data.expires_in - 60) * 1000,
    };
    return this.cached.token;
  }
}
