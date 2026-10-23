/** Only source-supplied HTTP(S) images. Failed loads use a textual placeholder. */
export function productImageUrl(urls: readonly string[]): string | null {
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch { /* A malformed source URL is missing data, not an executable URL. */ }
  }
  return null;
}
