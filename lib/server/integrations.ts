import "server-only";
// Same server-only environment convention as Butchers Counter; no credential values copied.
// Environment presence must never enable a paid or live service without authentication.
export function integrationConfiguration() {
  return {
    mode: "demo" as const,
    liveEnabled: false,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.HC_ASSETS_OPENAI_MODEL || "",
    searchModel: process.env.HC_ASSETS_SEARCH_MODEL || "",
    spreadsheetConfigured: Boolean(process.env.HC_ASSETS_SPREADSHEET_ID),
    writerConfigured: Boolean(
      process.env.HC_ASSETS_GATEWAY_URL && process.env.HC_ASSETS_GATEWAY_SECRET,
    ),
  };
}
export interface PhotoExtraction {
  brand: string | null;
  model: string | null;
  serial: string | null;
  specs: string | null;
  confidence: Record<string, "high" | "low" | "unknown">;
}
export interface Comparable {
  title: string;
  url: string;
  price: number;
  currency: "AED" | "USD" | "EUR" | "GBP";
  checkedAt: string;
  region: string;
  condition: string;
}
export interface ResaleEvidence {
  comparables: Comparable[];
  rangeAED: { low: number; high: number } | null;
  asOf: string | null;
  limitations: string[];
}
export interface AssetIntelligence {
  extract(photos: string[]): Promise<PhotoExtraction>;
  resale(identity: {
    brand: string;
    model: string;
    specs: string;
    condition: string;
  }): Promise<ResaleEvidence>;
}
