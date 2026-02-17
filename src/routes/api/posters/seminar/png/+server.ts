import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async () => {
  return json(
    {
      error:
        "Server-side poster rendering is disabled. Use the seminar form preview download button instead.",
    },
    { status: 410 },
  );
};
