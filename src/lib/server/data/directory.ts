import { getTable } from "./tables";
import type { Member } from "./schemas";

/**
 * 회원 표시용 통합 디렉터리 (S9).
 *
 * 운영 DB(members — 학기별 등록제의 새 DB)와 기록 보관 DB(legacy-members —
 * 노션 이주분, 읽기 전용)를 합쳐 "이름·학과·직책을 보여주는" 모든 곳이 쓴다.
 * 과거 기록(세미나·스터디·활동)의 memberId는 legacy id를 가리키므로, 이름
 * 해석은 반드시 이 병합본으로 해야 한다. 운영 로직(로그인 매칭·참여·권한)은
 * 절대 legacy를 읽지 않는다 — 그쪽은 getTable("members")만.
 *
 * 같은 사람이 재가입하면 새 행이 legacyMemberId로 옛 행을 가리킨다 —
 * 명단(dedupe)에서는 새 행이 옛 행을 가리고, id 조회에서는 둘 다 그 사람으로
 * 해석된다.
 */

export async function getMemberDirectory(): Promise<Member[]> {
  const [current, legacy] = await Promise.all([
    getTable("members"),
    getTable("legacy-members"),
  ]);
  const shadowed = new Set(current.map((m) => m.legacyMemberId).filter(Boolean));
  return [...current, ...legacy.filter((l) => !shadowed.has(l.id))];
}

/** id → 회원 (legacy id로도, 그걸 잇는 새 id로도 찾는다) */
export async function getDirectoryIndex(): Promise<Map<string, Member>> {
  const [current, legacy] = await Promise.all([
    getTable("members"),
    getTable("legacy-members"),
  ]);
  const index = new Map<string, Member>();
  for (const m of legacy) index.set(m.id, m);
  for (const m of current) {
    index.set(m.id, m);
    if (m.legacyMemberId) index.set(m.legacyMemberId, m); // 새 행이 legacy 조회를 가린다
  }
  return index;
}
