import type { RequestHandler } from "./$types";

const PUBLIC_PATHS = [
  "/",
  "/about",
  "/about/charter",
  "/about/executives",
  "/about/elections",
  "/about/press",
  "/about/finance",
  "/archive",
  "/archive/seminars",
  "/archive/studies",
  "/archive/activities",
  "/archive/gallery",
  "/archive/projects",
  "/archive/misc",
  "/archive/misc/integration-bee",
  "/archive/problems",
  "/archive/discussions",
  "/members",
] as const;

export const GET: RequestHandler = ({ url }) => {
  const urls = PUBLIC_PATHS.map(
    (path) => `  <url><loc>${new URL(path, url.origin).href}</loc></url>`,
  ).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    },
  );
};
