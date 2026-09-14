import { error } from "@sveltejs/kit";
import { getPublicSeminar } from "$lib/server/public/archive";
import { httpGuard } from "$lib/server/core/http";
import { getTable } from "$lib/server/data/tables";
import type { PageServerLoad } from "./$types";


export const load: PageServerLoad = async ({ params }) => {
  // 404 (no such seminar) and 503 (cannot reach the data layer) are different
  // facts; httpGuard keeps the AppError's status instead of flattening to 500.
  const seminar = await httpGuard(() => getPublicSeminar(params.id));
  if (!seminar) throw error(404, "Not Found");

  // Enrich from real links only: the source request carries the proposal
  // fields (description/prerequisites/duration), the approval-stamped
  // activity carries the schedule. Nothing here is fabricated.
  const [rows, requests, activities] = await httpGuard(() =>
    Promise.all([
      getTable("seminars"),
      getTable("seminar-requests"),
      getTable("activities"),
    ]),
  );
  const row = rows.find((s) => s.id === params.id);
  const request = row?.sourceRequestId
    ? (requests.find((r) => r.id === row.sourceRequestId) ?? null)
    : null;
  const activity = row?.activityId
    ? (activities.find((a) => a.id === row.activityId) ?? null)
    : null;

  return {
    seminar: {
      ...seminar,
      description: request?.description ?? seminar.note,
      prerequisites: request?.prerequisites ?? "",
      duration: request?.duration ?? "",
      scheduledAt: activity?.date.start ?? null,
    },
  };
};
