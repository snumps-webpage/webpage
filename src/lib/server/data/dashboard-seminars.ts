import type { OwnSeminarRequestItem } from "$lib/domain/seminar-progress";
import type { Seminar, SeminarRequest } from "./schemas";

/** Filter before projecting. No raw proposal or seminar row crosses this boundary. */
export function ownSeminarRequests(
  requests: readonly SeminarRequest[],
  seminars: readonly Seminar[],
  myIds: ReadonlySet<string>,
  memberId: string,
  canParticipate: boolean,
): OwnSeminarRequestItem[] {
  const byRequest = new Map(
    seminars
      .filter((s) => s.sourceRequestId)
      .map((s) => [s.sourceRequestId, s]),
  );
  return requests
    .filter(
      (r) =>
        myIds.has(r.requesterId) || r.presenterIds.some((id) => myIds.has(id)),
    )
    .map((r) => {
      const linked = byRequest.get(r.id);
      const seminar = r.status === "approved" ? linked : undefined;
      const cancelled =
        !!r.closedAs || linked?.publicationStatus === "cancelled";
      const schedule = !cancelled ? seminar?.schedule : null;
      return {
        id: r.id,
        title: r.title,
        status: cancelled ? "cancelled" : r.status,
        submittedAt: r.createdAt,
        publicationStatus: cancelled
          ? "cancelled"
          : (seminar?.publicationStatus ?? null),
        schedule: schedule
          ? {
              startsAt: schedule.startsAt,
              startTime: schedule.startTime,
              endsAt: schedule.endsAt,
              location: schedule.location,
            }
          : null,
        publicPath:
          !cancelled && seminar?.publicationStatus === "published"
            ? `/archive/seminars/${encodeURIComponent(seminar.id)}`
            : null,
        // A presenter or linked legacy requester can read, but the edit route
        // requires the current requester ID and the member write capability.
        editPath:
          !cancelled &&
          r.status === "pending" &&
          r.requesterId === memberId &&
          canParticipate
            ? `/seminar/edit/${encodeURIComponent(r.id)}`
            : null,
      };
    });
}
