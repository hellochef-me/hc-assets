/** Specifications and accessories retain their string fields and Sheet schema. */
export const ENTRY_LIST_CHARACTER_LIMIT = 400;

/** Only explicit line breaks identify entries; legacy prose stays intact. */
export function parseEntryList(value: string): string[] {
  return value.split(/\r\n|\n|\r/).filter((entry) => entry.trim().length > 0);
}

/** Canonical storage is one nonempty entry per line, in the supplied order. */
export function serializeEntryList(entries: readonly string[]): string {
  return entries
    .flatMap(parseEntryList)
    .map((entry) => entry.trim())
    .join("\n");
}
