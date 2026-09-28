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

  // Enrich from real links only: the source request carries the proposal's
  // description and its free-text duration (the fallback while no minutes
  // are recorded on the seminar), the approval-stamped activity carries the
  // schedule. Nothing here is fabricated.
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
      // 세미나 자신의 소개글이 먼저다 — 신청 설명은 신청 흐름으로 만든
      // 세미나에만 있고, 비고는 설명이 아니라 덧붙이는 말이다.
      description: seminar.description || request?.description || seminar.note,
      // 선수지식·소요 시간은 세미나 자신의 기록이다 (#7, #12). 신청서가 보태는
      // 것은 분이 적히지 않았을 때의 자유 서술 소요 시간뿐이다.
      prerequisites: seminar.prerequisites,
      duration:
        seminar.durationMinutes !== null
          ? `${seminar.durationMinutes}분`
          : (request?.duration ?? ""),
      // 세미나 자신의 확정 일정이 먼저다 — 활동 날짜는 그 다음이다.
      scheduledAt: row?.schedule?.startsAt ?? activity?.date.start ?? null,
      // 시각을 모르면(이주분) 화면은 날짜만 보여 준다. 활동 날짜로 떨어진
      // 경우도 시각을 아는 것이 아니므로 미상으로 다룬다.
      startTimeKnown: row?.schedule ? row.schedule.startTime !== null : false,
    },
  };
};
