import { redirect, error, fail, type ActionFailure } from "@sveltejs/kit";
import { hasCapability, type Capability } from "./core/capabilities";
import { AppError } from "./core/errors";
import { resolveMember } from "./guards/resolve-member";
import type { MemberContext } from "./guards/zone";

export interface AuthenticatedSession {
  user: {
    name: string;
    email: string;
    image?: string;
  };
  expires: string;
}

/** Admin truth is the member record (D4). Resolves lazily for /api handlers. */
async function resolveAdminContext(
  locals: App.Locals,
): Promise<{ session: AuthenticatedSession; member: MemberContext } | null> {
  const session = await locals.auth();
  if (!session?.user?.email) return null;
  const member =
    locals.member !== undefined ? locals.member : await resolveMember(session.user.email);
  locals.member = member;
  if (!member?.isAdmin) return null;
  return { session: session as AuthenticatedSession, member };
}

/**
 * Ensures a valid session exists, otherwise redirects to login.
 */
export async function ensureSession(
  locals: App.Locals,
  url?: URL,
): Promise<AuthenticatedSession> {
  const session = await locals.auth();
  if (!session?.user?.email || !session.user.name) {
    const loginPath = url
      ? `/login?redirect=${encodeURIComponent(url.pathname)}`
      : "/login";
    throw redirect(302, loginPath);
  }
  return session as AuthenticatedSession;
}

/**
 * Ensures the user is an admin.
 * Throws 404 if not (Security by Obscurity).
 */
export async function ensureAdmin(
  locals: App.Locals,
  options: { silent?: boolean } = {},
): Promise<AuthenticatedSession> {
  const ctx = await resolveAdminContext(locals);
  if (!ctx) {
    if (options.silent) throw error(404, "Not Found");
    throw redirect(302, "/");
  }
  return ctx.session;
}

/**
 * Helper for form actions and /api handlers to verify admin status.
 */
export async function requireAdminAction(locals: App.Locals) {
  const ctx = await resolveAdminContext(locals);
  if (!ctx) {
    return {
      allowed: false as const,
      response: fail(403, { error: "FORBIDDEN" }),
    };
  }
  return { allowed: true as const, session: ctx.session };
}

type ActionResult<T> =
  | ActionFailure<Record<string, unknown>>
  | (T & { success: true })
  | { success: true };

/**
 * The one action body shared by user and admin wrappers (§1-2):
 * ActionFailure pass-through, cache invalidation, redirect rethrow,
 * AppError → fail(status, { error: CODE, message?: 한국어 }). The CODE is the
 * contract; `message` is an optional human-facing detail for direct display.
 */
async function runAction<T extends Record<string, unknown>>(
  session: AuthenticatedSession,
  logic: (
    session: AuthenticatedSession,
  ) => Promise<T | void | ActionFailure<Record<string, unknown>>>,
  options: { invalidate?: string | string[] } = {},
): Promise<ActionResult<T>> {
  try {
    const result = await logic(session);

    if (
      result &&
      typeof result === "object" &&
      "status" in result &&
      typeof result.status === "number" &&
      result.status >= 400
    ) {
      return result as ActionFailure<Record<string, unknown>>;
    }

    if (options.invalidate) {
      const { invalidateCache } = await import("./cache");
      const keys = Array.isArray(options.invalidate)
        ? options.invalidate
        : [options.invalidate];
      keys.forEach((key) => invalidateCache(key));
    }

    if (result && typeof result === "object") {
      return { success: true, ...(result as T) };
    }
    return { success: true };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "status" in e &&
      (e as { status: number }).status >= 300 &&
      (e as { status: number }).status < 400
    )
      throw e;
    if (e instanceof AppError) {
      return fail(e.status, { error: e.code, message: e.userMessage });
    }
    console.error(`[Action Error]`, e);
    return fail(500, { error: (e as Error).message || "Action failed" });
  }
}

/**
 * Standard wrapper for user actions.
 */
/**
 * S9: 원자 capability 게이트. 회원 존 쓰기 액션은 이걸로 PARTICIPATE 등을
 * 요구한다 — 동문(열람 전용)·미등록 회원의 쓰기를 서비스 앞에서 차단.
 * locals.member는 zone guard가 이미 해석해 둔 상태다.
 */
export function requireCapability(locals: App.Locals, cap: Capability): void {
  if (!hasCapability(locals.member?.capabilities, cap)) {
    throw new AppError("FORBIDDEN", {
      userMessage: "이번 학기 등록 회원만 할 수 있는 작업입니다.",
    });
  }
}

export async function handleUserAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  logic: (
    session: AuthenticatedSession,
  ) => Promise<T | void | ActionFailure<Record<string, unknown>>>,
  options: { invalidate?: string | string[] } = {},
): Promise<ActionResult<T> | ActionFailure<{ error: string }>> {
  let session;
  try {
    session = await ensureSession(locals);
  } catch {
    return fail(401, { error: "FORBIDDEN" });
  }
  return runAction(session, logic, options);
}

/**
 * Standard wrapper for admin actions.
 */
export async function handleAdminAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  logic: (
    session: AuthenticatedSession,
  ) => Promise<T | void | ActionFailure<Record<string, unknown>>>,
  options: { successMessage?: string; invalidate?: string | string[] } = {},
): Promise<ActionResult<T> | ActionFailure<{ error: string }>> {
  const { allowed, response, session } = await requireAdminAction(locals);
  if (!allowed || !session) return response!;
  return runAction(session, logic, options);
}

/**
 * Action-level guards (API-SPEC §1-1): re-fetches the record instead of
 * trusting anything client-supplied or cached on locals.
 * NOTE: presenter authority deliberately has NO counterpart here — it lives
 * in services/events.ts (savePresenterAttendance), one owner per authority.
 */
export async function ensureOrganizer(studyId: string, memberId: string) {
  const { getTable } = await import("./data/tables");
  const study = (await getTable("studies")).find((s) => s.id === studyId);
  if (!study) throw new AppError("NOT_FOUND");
  // S9: 재가입 회원의 이주된 스터디는 organizerIds가 그 사람의 LEGACY id를
  // 담고 있다 — 현재 id와 legacyMemberId 둘 다 조직자 자격으로 인정한다.
  // (호출자는 항상 운영 members의 회원 — legacy 전용 id로는 로그인 불가.)
  const caller = (await getTable("members")).find((m) => m.id === memberId);
  const candidateIds = new Set(
    [memberId, caller?.legacyMemberId].filter((id): id is string => !!id),
  );
  if (!study.organizerIds.some((id) => candidateIds.has(id))) {
    throw new AppError("FORBIDDEN");
  }
  return study;
}
