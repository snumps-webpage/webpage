/**
 * A stored URL as a link target: the value when it is an absolute http(s)
 * URL, otherwise null (render no link). Forms check the scheme, but stored
 * rows are not only written by forms — the Notion migration copied URLs as
 * they were — and Svelte passes `javascript:` hrefs through at runtime
 * (audit LC13-1, LA29-7). Browser-safe.
 */
export function externalHref(value: string | null | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  return URL.canParse(value) ? value : null;
}
