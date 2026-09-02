/**
 * 권한 capability 모델 (결정 S9).
 *
 * 회원의 실제 행위 권한은 지위(status/동문)가 아니라 여기서 파생되는
 * capability 집합으로 판정한다 — 원자 단위로 넣고 빼기 쉬운 형태가 목적:
 * 새 권한이 생기면 Capability 값 하나와 파생 규칙 한 줄이 늘어날 뿐,
 * 가드·서비스 호출부는 requireCapability만 쓴다.
 *
 * 파생 규칙 (회칙 재분류 전 기준):
 * - 이번 학기 등록(registrations에 currentTerm 행) → 전체 capability
 * - 미등록 + 동문(isAlumni)                        → 회원 존 열람만
 * - 미등록 + 비동문(준회원 이력뿐)                 → 없음 (재가입 필요)
 * - withdrawn은 capability 이전 단계(가드)에서 차단된다
 */

export const CAPABILITIES = {
  /** 회원 존 페이지 열람 */
  VIEW_MEMBER_ZONE: "member.view",
  /** 참여 행위 전반 — 세미나/스터디 개설 신청, 참여/탈퇴, 출석 체크인 */
  PARTICIPATE: "member.participate",
  /** 본인 것 관리 — 알림 설정, 개인정보 수정, 탈퇴 신청 */
  MANAGE_SELF: "member.self",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export interface CapabilityInput {
  isAlumni: boolean;
  /** 이번 학기(currentTerm) 등록 행 존재 여부 */
  registered: boolean;
}

export function capabilitiesFor(input: CapabilityInput): Capability[] {
  if (input.registered) {
    return [CAPABILITIES.VIEW_MEMBER_ZONE, CAPABILITIES.PARTICIPATE, CAPABILITIES.MANAGE_SELF];
  }
  if (input.isAlumni) {
    // 동문: 미등록 학기에도 회원 존을 "보기만" 할 수 있다 + 본인 것 관리
    return [CAPABILITIES.VIEW_MEMBER_ZONE, CAPABILITIES.MANAGE_SELF];
  }
  return [];
}

export function hasCapability(caps: readonly Capability[] | undefined, cap: Capability): boolean {
  return (caps ?? []).includes(cap);
}
