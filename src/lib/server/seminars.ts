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
    return rawIds.split(",").map((id) => id.trim()).filter(Boolean);
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

export async function updateSeminarRequest(
  id: string,
  data: {
    title?: string;
    description?: string;
    prerequisites?: string;
    duration?: string;
    speakerIds?: string[];
    attachment?: string;
  },
) {
  try {
    await updateSeminarRequestInNotion(id, data);
    return { id, ...data };
  } catch (e) {
    console.error("Failed to update seminar request in Notion:", e);
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
    console.error("Failed to update seminar request in Notion:", e);
    throw e;
  }
}

/**
 * Fetches all pending seminar requests and resolves speaker names.
 */
export async function getPendingSeminarRequests(skipCache = false) {
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
}

