import { error } from "@sveltejs/kit";
import type { SeminarRequest } from "$lib/types";
import {
  getSeminarRequestsFromNotion,
  createSeminarRequestInNotion,
  updateSeminarRequestInNotion,
  updateSeminarRequestStatusInNotion,
  removeSeminarRequestInNotion,
} from "./notion";

/**
 * Parses speaker IDs from raw form data (JSON string or comma-separated).
 */
export function parseSpeakerIds(rawIds?: string | null): string[] {
  if (!rawIds) return [];
  try {
    return JSON.parse(rawIds);
  } catch {
    return rawIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
}

export async function getSeminarRequests(
  skipCache = false,
): Promise<SeminarRequest[]> {
  try {
    const results = await getSeminarRequestsFromNotion(skipCache);
    return results as SeminarRequest[];
  } catch (e) {
    console.error("Failed to fetch seminar requests from Notion:", e);
    return [];
  }
}

export async function deleteSeminarRequest(id: string) {
  try {
    await removeSeminarRequestInNotion(id);
  } catch (e) {
    console.error("Failed to delete seminar request from Notion:", e);
    throw e;
  }
}

export async function createSeminarRequest(data: {
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  speakerIds: string[];
  attachment?: string;
}) {
  try {
    const id = await createSeminarRequestInNotion({
      ...data,
    });
    if (!id) throw new Error("Notion creation returned no ID");

    return {
      ...data,
      id,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("Notion seminar request write failed:", e);
    throw e;
  }
}

/**
 * Who is attempting to act on a seminar request.
 *
 * `memberId` is the Notion Members page id of the signed-in user, or null when
 * the user has no member record.
 */
export interface SeminarRequestActor {
  memberId: string | null;
  isAdmin: boolean;
}

/**
 * Resolves a seminar request the actor is allowed to edit, or throws.
 *
 * Authorization rules:
 *   - admins may edit any request;
 *   - otherwise the actor must be listed in `speakerIds`;
 *   - non-pending requests are not editable through this path.
 *
 * A non-owner gets 404, not 403, so that request ids cannot be probed for
 * existence.
 */
export async function requireEditableSeminarRequest(
  id: string,
  actor: SeminarRequestActor,
): Promise<SeminarRequest> {
  const request = (await getSeminarRequests()).find((r) => r.id === id);
  if (!request) throw error(404, "Seminar request not found");

  if (actor.isAdmin) return request;

  const speakerIds = Array.isArray(request.speakerIds) ? request.speakerIds : [];
  if (!actor.memberId || !speakerIds.includes(actor.memberId)) {
    throw error(404, "Seminar request not found");
  }

  if (request.status !== "pending") {
    throw error(403, "이미 처리된 신청은 수정할 수 없습니다.");
  }

  return request;
}

/**
 * Updates a seminar request after verifying the actor may edit it.
 *
 * The ownership check lives here rather than in the caller so that no call site
 * can perform an unauthorized write — see `docs/code-audit` SM-12.
 */
export async function updateSeminarRequest(
  id: string,
  actor: SeminarRequestActor,
  data: {
    title?: string;
    description?: string;
    prerequisites?: string;
    duration?: string;
    speakerIds?: string[];
    attachment?: string;
  },
) {
  await requireEditableSeminarRequest(id, actor);

  try {
    await updateSeminarRequestInNotion(id, data);
    return { id, ...data };
  } catch (e) {
    console.error("Failed to persist seminar request update in Notion:", e);
    throw e;
  }
}

export async function updateSeminarRequestStatus(
  id: string,
  status: "approved" | "rejected",
) {
  try {
    await updateSeminarRequestStatusInNotion(id, status);
    return { id, status };
  } catch (e) {
    console.error("Failed to update seminar request status in Notion:", e);
    throw e;
  }
}

/**
 * Fetches all pending seminar requests and resolves speaker names.
 */
export async function getPendingSeminarRequests(skipCache = false) {
  try {
    const { getAllMembers } = await import("./notion");
    const [requests, members] = await Promise.all([
      getSeminarRequests(skipCache),
      getAllMembers(skipCache),
    ]);

    return requests
      .filter((r) => r.status === "pending")
      .map((r) => ({
        ...r,
        speakerNames: Array.isArray(r.speakerIds)
          ? r.speakerIds.map((id) => {
              const m = members.find((member) => member.id === id);
              return m ? m.name : "Unknown";
            })
          : [],
      }));
  } catch (e) {
    console.error("Failed to fetch pending seminar requests:", e);
    return [];
  }
}
