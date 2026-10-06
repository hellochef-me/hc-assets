import "server-only";

export class ProviderError extends Error {
  constructor(
    public code:
      "configuration" | "unavailable" | "invalid_response" | "uncertain_write",
    message: string,
  ) {
    super(message);
  }
}
// Do not relay upstream bodies (which may contain tokens, photos or employee data).
// No automatic retries: a timed-out paid request or write may have succeeded.
export async function providerJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  limit = 2_000_000,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ProviderError(
      "unavailable",
      "The service did not respond. Try again explicitly.",
    );
  }
  if (!response.ok)
    throw new ProviderError(
      "unavailable",
      `The service rejected the request (${response.status}).`,
    );
  if (!response.body)
    throw new ProviderError(
      "invalid_response",
      "The service returned no response.",
    );
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > limit) {
        await reader.cancel();
        throw new ProviderError(
          "invalid_response",
          "The service response was too large.",
        );
      }
      chunks.push(item.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "invalid_response",
      "The service returned an unreadable response.",
    );
  }
}
