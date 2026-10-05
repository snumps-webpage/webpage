import { json } from "@sveltejs/kit";
import { readBuildInfo } from "$lib/server/build-info";
import type { RequestHandler } from "./$types";

// What the live site was built from — scripts/ops/check-deployed.mjs compares
// it with git. Public: a commit hash and a content hash, nothing else. Never
// cached, or a stale copy would report an old build as the live one.
export const GET: RequestHandler = () =>
  json(readBuildInfo(), { headers: { "cache-control": "no-store" } });
