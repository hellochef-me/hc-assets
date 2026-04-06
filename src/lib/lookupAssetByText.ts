import { requestParsedAsset } from '@/lib/assetAi'
import type { ParsedAsset } from '@/lib/assetAi'

export async function lookupAssetByText(query: string): Promise<ParsedAsset> {
  return requestParsedAsset([
      {
        role: 'system',
        content: `You are an IT asset identification assistant. Given partial device info (serial number, model name, brand, or any combination), identify the device and return structured specs.

Phone lookups matter too. If the input references an iPhone, Samsung Galaxy, Google Pixel, IMEI, or another phone identifier, classify it as a phone and infer the likely model/storage when you can do so confidently.

Return ONLY valid JSON:
{
  "category": "laptop" | "phone" | "monitor" | "peripheral",
  "assetName": "friendly name e.g. MacBook Pro 14-inch M3",
  "manufacturer": "e.g. Apple, Dell, HP, Lenovo, Samsung, Google",
  "model": "exact model identifier",
  "serialNumber": "the serial number if provided",
  "cpu": "processor description",
  "ramGb": "RAM in GB as a number string e.g. 16",
  "diskGb": "storage in GB as a number string e.g. 512",
  "modelYear": "year as string e.g. 2024",
  "purchasePrice": "approximate retail price if known, otherwise empty",
  "purchaseCurrency": "USD if price given, otherwise empty",
  "condition": "",
  "notes": ""
}

Use empty string for fields you cannot determine. If the serial number encodes model info (e.g. Apple serials) or the query includes a phone identifier such as IMEI/model code, decode what you can. If only a brand is given, leave model-specific fields empty but fill in the manufacturer. Be accurate — do not fabricate serial numbers or specs you are not confident about.`,
      },
      {
        role: 'user',
        content: `Identify this device and return the JSON:\n\n${query}`,
      },
  ], 600)
}
