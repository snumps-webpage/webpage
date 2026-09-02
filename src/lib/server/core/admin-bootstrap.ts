import { createHash } from "node:crypto";
import { env } from "$env/dynamic/private";

/**
 * S9 관리자 부트스트랩 (보안 리뷰 반영판).
 *
 * ADMINS_EMAILS는 "빈 운영 DB에서 첫 승인을 할 사람"을 위한 **부트스트랩
 * 전용** 권위다 — 운영 회원 행이 생기면 D4 원칙(관리자 진실은 회원 레코드)로
 * 복귀한다:
 * - 회원 행이 없는 동안: env 명단 = 관리자 (관리자 존 + 가입 신청)
 * - 승인 전환 시: env 명단 여부를 회원 행의 isAdmin에 **스탬프**
 * - 회원 행이 있는 뒤: env 명단은 더 이상 참조하지 않는다 — 관리자 해제는
 *   회원 관리 화면(isAdmin)에서, env는 명단 정리만 하면 된다
 */
export function isBootstrapAdminEmail(email: string): boolean {
  return (env.ADMINS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

/**
 * 부트스트랩 관리자의 actor id — 감사 기록에 이메일(PII)을 직접 싣지 않되,
 * env 명단(소수)과 대조하면 누구인지 특정 가능한 결정적 식별자.
 */
export function bootstrapAdminActorId(email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `env-admin-${digest.slice(0, 8)}`;
}
