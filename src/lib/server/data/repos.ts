import { getTable } from "./tables";
import type { Activity, Member, PrivateInfo } from "./schemas";

/**
 * Read helpers over the table layer (BE-30). Plain array scans — the tables
 * hold hundreds of rows; do NOT grow an index/query layer here (threshold
 * notes in API-SPEC §1-3).
 */

export async function memberPickers(): Promise<
  { id: string; name: string; department: string }[]
> {
  const members = await getTable("members");
  return members
    .filter((m) => m.status !== "withdrawn")
    .map((m) => ({ id: m.id, name: m.name, department: m.department }));
}

export async function getMemberById(id: string): Promise<Member | null> {
  return (await getTable("members")).find((m) => m.id === id) ?? null;
}

export async function getPrivateInfoOf(memberId: string): Promise<PrivateInfo | null> {
  return (await getTable("private-info")).find((p) => p.memberId === memberId) ?? null;
}

export async function getActivitiesBetween(start: Date, end: Date): Promise<Activity[]> {
  const activities = await getTable("activities");
  return activities.filter((a) => {
    const d = new Date(a.date.start);
    return d >= start && d < end;
  });
}

export async function getActivitiesOf(memberId: string): Promise<Activity[]> {
  return (await getTable("activities")).filter((a) => a.attendeeIds.includes(memberId));
}
