import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { ensureCreated } from "$lib/server/data/idempotency";
import type { Application } from "$lib/server/data/schemas";

/**
 * Membership lifecycle (API-SPEC §4-1~4-3, §7-2).
 * The applications table holds only unprocessed rows: approval CONVERTS the
 * row into private-info + members and removes it; rejection and
 * self-withdrawal remove it outright.
 */

const norm = (email: string) => email.trim().toLowerCase();

export async function getApplicationForEmail(email: string): Promise<Application | null> {
  const apps = await getTable("applications");
  return apps.find((a) => norm(a.email) === norm(email)) ?? null;
}

export async function submitApplication(input: {
  email: string;
  name: string;
  department: string;
  phone: string;
  background: string;
}): Promise<Application> {
  const row: Application = {
    id: newId(),
    ...input,
    email: norm(input.email),
    createdAt: nowKstIso(),
  };
  await mutate("applications", (rows) => {
    if (rows.some((a) => norm(a.email) === row.email)) {
      throw new AppError("CONFLICT");
    }
    return [...rows, row];
  });
  return row;
}

export async function updateOwnApplication(
  email: string,
  patch: Partial<Pick<Application, "name" | "department" | "phone" | "background">>,
): Promise<void> {
  await mutate("applications", (rows) => {
    const idx = rows.findIndex((a) => norm(a.email) === norm(email));
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], ...patch };
    return rows;
  });
}

/** MEM-03: the applicant's own withdrawal button on /wait — the row (and its PII) goes away now. */
export async function withdrawOwnApplication(email: string): Promise<void> {
  await mutate("applications", (rows) => {
    if (!rows.some((a) => norm(a.email) === norm(email))) throw new AppError("NOT_FOUND");
    return rows.filter((a) => norm(a.email) !== norm(email));
  });
}

/**
 * §7-2 ?/approve — the conversion. Order: create private-info, create member,
 * then remove the application row LAST so a mid-sequence failure re-runs
 * cleanly (ensureCreated dedupes on sourceRequestId).
 */
export async function approveApplication(
  id: string,
): Promise<{ name: string; email: string }> {
  const app = (await getTable("applications")).find((a) => a.id === id);
  if (!app) {
    // Row already gone: either fully converted (member exists) or never existed.
    const converted = (await getTable("members")).some((m) => m.sourceRequestId === id);
    throw new AppError(converted ? "CONFLICT" : "NOT_FOUND");
  }

  const member = await ensureCreated("members", id, () => ({
    id: newId(),
    name: app.name,
    department: app.department,
    joinedAt: nowKstIso().slice(0, 10),
    status: "associate" as const,
    statusChangedAt: nowKstIso(),
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    roles: [],
    isAdmin: false,
    publicContact: null,
    project: null,
    sourceRequestId: id,
  }));

  await ensureCreated("private-info", id, () => ({
    id: newId(),
    memberId: member.id,
    email: app.email,
    phone: app.phone,
    background: app.background,
    mailPrefs: { announcements: true },
    sourceRequestId: id,
  }));

  await mutate("applications", (rows) => rows.filter((a) => a.id !== id));
  return { name: app.name, email: app.email };
}

export async function rejectApplication(id: string): Promise<{ email: string } | null> {
  let removed: Application | undefined;
  await mutate("applications", (rows) => {
    removed = rows.find((a) => a.id === id);
    if (!removed) throw new AppError("NOT_FOUND");
    return rows.filter((a) => a.id !== id);
  });
  return removed ? { email: removed.email } : null;
}
