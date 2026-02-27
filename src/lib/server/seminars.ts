/** --- DOMAIN LOGIC --- 
 * Manages the lifecycle of member-led seminar proposals.
 */
import type { SeminarRequest } from "$lib/types";
import {
  getSeminarRequestsFromNotion,
  createSeminarRequestInNotion,
  updateSeminarRequestInNotion,
  updateSeminarRequestStatusInNotion,
  removeSeminarRequestInNotion,
} from "./notion";

export async function getSeminarRequests(
  skipCache = false,
): Promise<SeminarRequest[]> {
  try {
    const results = await getSeminarRequestsFromNotion(skipCache);
    return results as SeminarRequest[];
  } catch (e) {
    console.error("[Seminars Domain] Fetch failed:", e);
    return [];
  }
}

export async function deleteSeminarRequest(id: string) {
  try {
    await removeSeminarRequestInNotion(id);
  } catch (e) {
    console.error("[Seminars Domain] Deletion failed:", e);
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
    const id = await createSeminarRequestInNotion(data);
    if (!id) throw new Error("Notion creation returned no ID");

    return {
      ...data,
      id,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[Seminars Domain] Creation failed:", e);
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
    console.error("[Seminars Domain] Update failed:", e);
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
    console.error("[Seminars Domain] Status update failed:", e);
    throw e;
  }
}
