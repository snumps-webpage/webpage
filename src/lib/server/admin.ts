/**
 * Service for managing club membership applications stored in Notion.
 */
import { env } from "$env/dynamic/private";
import { dev } from "$app/environment";
import {
  getApplicationsFromNotion,
  getApplicationByEmail as getApplicationByEmailFromNotion,
  createApplicationInNotion,
  removeApplicationInNotion,
  getAllMembers,
  getAllPrivateInfo,
  getMemberByEmail,
  getMemberById,
} from "./notion";
import { DEV_PREVIEW_ADMIN_EMAIL } from "./dev-preview";
import { parseGoogleName } from "../utils";
import type { AuthenticatedSession } from "./auth-guards";

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

export interface SearchableMember {
  id: string;
  name: string;
  department: string;
  email: string;
}

/**
 * Merges the Members and Private Info databases into a single searchable list.
 */
export async function getSearchableMembers(): Promise<SearchableMember[]> {
  const [members, privateInfos] = await Promise.all([
    getAllMembers(),
    getAllPrivateInfo(),
  ]);

  const memberMap = new Map(members.map((m) => [m.id, m]));

  return privateInfos
    .filter((p) => p.memberId && memberMap.has(p.memberId))
    .map((p) => {
      const member = memberMap.get(p.memberId!)!;
      return {
        id: member.id,
        name: member.name,
        department: member.department,
        email: p.email,
      };
    });
}

/**
 * Resolves the "Actual Name" of a user by checking the Member DB first,
 * then falling back to parsing the Google account string.
 */
export async function resolveActualName(
  session: AuthenticatedSession,
): Promise<string> {
  if (!session?.user?.email) return "";

  const memberInfo = await getMemberByEmail(session.user.email);
  if (memberInfo) {
    const m = await getMemberById(memberInfo.memberId);
    return m.name;
  }

  return parseGoogleName(session.user.name).name;
}

export async function getApplicationByEmail(
  email: string,
  skipCache = false,
): Promise<Application | null> {
  try {
    return await getApplicationByEmailFromNotion(email, skipCache);
  } catch (e) {
    console.error(`Failed to fetch application for ${email} from Notion:`, e);
    return null;
  }
}

export async function getApplications(
  skipCache = false,
): Promise<Application[]> {
  try {
    return await getApplicationsFromNotion(skipCache);
  } catch (e) {
    console.error("Failed to fetch applications from Notion:", e);
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
    console.error("Failed to create application in Notion:", e);
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
    console.error("Failed to update application in Notion:", e);
    throw e;
  }
}

export async function removeApplication(id: string) {
  try {
    await removeApplicationInNotion(id);
  } catch (e) {
    console.error("Failed to remove application from Notion:", e);
  }
}

export function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  if (dev && email === DEV_PREVIEW_ADMIN_EMAIL) return true;
  const admins = (env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
  return admins.includes(email);
}
