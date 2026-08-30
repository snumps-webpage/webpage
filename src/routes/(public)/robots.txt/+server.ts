import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url }) =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /settings\nDisallow: /signup\nDisallow: /wait\nDisallow: /withdraw\nDisallow: /events\nSitemap: ${url.origin}/sitemap.xml\n`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
