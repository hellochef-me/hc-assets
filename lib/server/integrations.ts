import "server-only";
// Server-only contracts; actual capability selection lives in backend.ts.
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
  indicative?: {
    goodWorkingAED: { low: number; high: number };
    estimatedAt: string;
    basis: "model-estimate";
    reasoning: string;
    assumptions: string[];
  };
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
