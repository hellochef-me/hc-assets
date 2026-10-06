import type { ResaleEvidence } from "./server/integrations";

export function resaleScenarios(evidence: ResaleEvidence) {
  const base = evidence.indicative?.goodWorkingAED || evidence.rangeAED;
  if (!base) return [];
  const rounded = (value: number) => {
    const step = value < 250 ? 5 : 25;
    return Math.max(0, Math.round(value / step) * step);
  };
  const sourced = !evidence.indicative;
  return [
    {
      label: "Good · fully working",
      assumptions:
        "Tested, healthy battery where applicable, normal wear, essential accessories included.",
      low: rounded(base.low * (sourced ? 0.8 : 1)),
      high: rounded(base.high),
    },
    {
      label: "Fair · working with wear",
      assumptions:
        "Working, visible wear, weaker battery or missing accessories; no major functional fault.",
      low: rounded(base.low * 0.5),
      high: rounded(base.high * 0.75),
    },
    {
      label: "Faulty · parts only",
      assumptions:
        "Major fault or not working; recoverable parts assumed. Locked, unsafe or unsalvageable equipment may be worth AED 0.",
      low: rounded(base.low * 0.1),
      high: rounded(base.high * 0.3),
    },
  ];
}
