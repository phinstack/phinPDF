const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Returns a normalized URL if it is safe to hand to the OS or a new tab, or null.
 * Blocks javascript:, file:, data:, custom schemes, and URLs with embedded credentials.
 */
export function sanitizeExternalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (url.username || url.password) return null;
  return url.href;
}
