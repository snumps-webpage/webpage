const PUBLIC_PAGE_ROOTS = ["/about", "/archive"] as const;
const PUBLIC_EXACT_PATHS = [
  "/",
  "/members",
  "/login",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
] as const;
const GUARD_BYPASS_ROOTS = ["/auth", "/api"] as const;

export function matchesPathRoot(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

export function shouldBypassMembershipGuard(path: string) {
  return (
    PUBLIC_EXACT_PATHS.some((allowed) => path === allowed) ||
    [...PUBLIC_PAGE_ROOTS, ...GUARD_BYPASS_ROOTS].some((root) =>
      matchesPathRoot(path, root),
    )
  );
}
