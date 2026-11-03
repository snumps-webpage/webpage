import { z } from "zod";
import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { auditStamp } from "$lib/server/data/audit";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import { getTable } from "$lib/server/data/tables";
import {
  Id,
  SeminarSchema,
  SeminarSeriesSchema,
  type Seminar,
  type SeminarSeries,
} from "$lib/server/data/schemas";

// New edits have UI limits; storage must keep every valid legacy seminar value.
const inputSchema = SeminarSeriesSchema.omit({ id: true }).extend({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000),
});
type SeriesInput = z.input<typeof inputSchema>;

async function adminOperation(
  actorMemberId: string,
  args: Record<string, unknown>,
) {
  if (!Id.safeParse(actorMemberId).success) throw new AppError("FORBIDDEN");
  return callFlow<
    FlowResult & { series: SeminarSeries; seminar: Seminar | null }
  >("flow_admin_seminar_series", { ...args, actorMemberId, ...auditStamp() });
}

/** Retryable compatibility step; creates no activities, events, mail or credits. */
export async function linkStandaloneSeminars(): Promise<void> {
  await callFlow("flow_link_seminar_series", {});
}

export async function getSeminarSeries() {
  await linkStandaloneSeminars();
  const [series, seminars] = await Promise.all([
    getTable("seminar-series"),
    getTable("seminars"),
  ]);
  return series.map((parent) => ({
    ...parent,
    sessions: seminars
      .filter((s) => s.seriesId === parent.id)
      .sort((a, b) => (a.sessionNo ?? 0) - (b.sessionNo ?? 0)),
  }));
}

export async function createSeminarSeries(
  actorMemberId: string,
  input: SeriesInput,
) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED");
  const series = { id: newId(), ...parsed.data };
  return (await adminOperation(actorMemberId, { operation: "create", series }))
    .series;
}

export async function updateSeminarSeries(
  actorMemberId: string,
  seriesId: string,
  input: SeriesInput,
): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || !Id.safeParse(seriesId).success)
    throw new AppError("VALIDATION_FAILED");
  await adminOperation(actorMemberId, {
    operation: "update",
    seriesId,
    patch: parsed.data,
  });
}

export async function createSeminarSeriesSession(
  actorMemberId: string,
  seriesId: string,
  input: {
    title?: string;
    semester: string;
    presenterIds: string[];
    externalPresenters?: string;
  },
): Promise<Seminar> {
  if (!Id.safeParse(seriesId).success) throw new AppError("VALIDATION_FAILED");
  const parsed = SeminarSchema.safeParse({
    id: newId(),
    title: input.title?.trim() || "회차",
    semester: input.semester,
    presenterIds: [...new Set(input.presenterIds)],
    externalPresenters: input.externalPresenters ?? "",
    description: "",
    note: "",
    materials: [],
    photos: [],
    posterKey: "",
    preferredTiming: "",
    publicationStatus: "unscheduled",
    kind: null,
    durationMinutes: null,
    prerequisites: "",
    videos: [],
    announce: false,
    schedule: null,
    announcedAt: null,
    semesterPinned: false,
    activityId: null,
    sourceRequestId: null,
  });
  if (!parsed.success) throw new AppError("VALIDATION_FAILED");
  const seminar = { ...parsed.data, title: input.title?.trim() ?? "" };
  return (
    await adminOperation(actorMemberId, {
      operation: "session",
      seriesId,
      seminar,
    })
  ).seminar!;
}

export async function setSeminarSessionAttendance(
  actorMemberId: string,
  seriesId: string,
  seminarId: string,
  attendeeIds: string[],
): Promise<void> {
  if (
    ![seriesId, seminarId, ...attendeeIds].every(
      (id) => Id.safeParse(id).success,
    )
  )
    throw new AppError("VALIDATION_FAILED");
  await adminOperation(actorMemberId, {
    operation: "attendance",
    seriesId,
    seminarId,
    attendeeIds: [...new Set(attendeeIds)],
  });
}
