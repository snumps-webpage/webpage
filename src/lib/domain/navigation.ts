const INTERNAL_REDIRECT_BASE = "https://snumps.invalid";

export function safeInternalRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, INTERNAL_REDIRECT_BASE);
    if (parsed.origin !== INTERNAL_REDIRECT_BASE) return "/";
    // Dot-segment resolution can turn "/.//host" into "//host" — check the
    // OUTPUT too, since that is what the browser will resolve.
    if (/^\/[/\\]/.test(parsed.pathname)) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
