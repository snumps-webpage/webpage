/** --- DOMAIN LOGIC --- 
 * Orchestrates membership application workflows.
 */
import { env } from "$env/dynamic/private";
import { dev } from "$app/environment";
import {
  getApplicationsFromNotion,
  createApplicationInNotion,
  removeApplicationInNotion,
} from "./notion";
import { DEV_PREVIEW_ADMIN_EMAIL } from "./dev-preview";

export interface Application {
  id: string;
  email: string;
  name: string;
  phone: string;
  department: string;
  background: string;
  accepted: boolean;
  submittedAt: string;
}

export async function getApplications(
  skipCache = false,
): Promise<Application[]> {
  try {
    return await getApplicationsFromNotion(skipCache);
  } catch (e) {
    console.error("[Admin Domain] Failed to fetch applications:", e);
    return [];
  }
}

export async function addApplication(
  app: Omit<Application, "id" | "submittedAt" | "accepted">,
) {
  try {
    const id = await createApplicationInNotion(app);
    return {
      ...app,
      id,
      submittedAt: new Date().toISOString(),
      accepted: false,
    };
  } catch (e) {
    console.error("[Admin Domain] Application creation failed:", e);
    throw e;
  }
}

export async function updateApplication(
  id: string,
  app: Omit<Application, "id" | "submittedAt" | "accepted" | "email">,
) {
  try {
    const { updateApplicationInNotion } = await import("./notion");
    await updateApplicationInNotion(id, app);
  } catch (e) {
    console.error("[Admin Domain] Application update failed:", e);
    throw e;
  }
}

export async function removeApplication(id: string) {
  try {
    await removeApplicationInNotion(id);
  } catch (e) {
    console.error("[Admin Domain] Application removal failed:", e);
  }
}

/** [Boundary: Security] Validates administrative privileges via environment allowlist. */
export function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  if (dev && email === DEV_PREVIEW_ADMIN_EMAIL) return true;
  const admins = (env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
  return admins.includes(email);
}
