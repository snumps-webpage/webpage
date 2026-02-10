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
