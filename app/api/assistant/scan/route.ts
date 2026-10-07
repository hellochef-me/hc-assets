import { body, guard, json } from "@/lib/server/http";
import { intelligence } from "@/lib/server/backend";
import {
  assistantFailure,
  assistantScanInput,
  assistantSource,
  fictionalExtraction,
} from "@/lib/server/assistant-intelligence";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    guard(request);
    const input = assistantScanInput.parse(await body(request));
    const source = await assistantSource();
    if (source.kind === "demo")
      return json({
        extraction: fictionalExtraction(),
        mode: "demo",
        notice:
          "Fictional demo label fixture. Your uploaded photos were not read. Review or replace every field before saving.",
      });
    const provider = await intelligence("ocr");
    return json({
      extraction: await provider.extract(input.photos),
      mode: "ai",
      notice:
        "AI label reading. Review each field against the visible equipment label before saving.",
    });
  } catch (error) {
    return assistantFailure(error);
  }
}
