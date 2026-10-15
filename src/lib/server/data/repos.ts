import { getTable } from "./tables";
import { withoutHiddenActivities } from "$lib/server/services/visibility";
import type { Activity, Member, PrivateInfo } from "./schemas";
import type {
  DirectoryPicker,
  PickerMember,
} from "$lib/domain/recorded-people";
import { getMemberDirectory } from "./directory";

/**
 * Read helpers over the table layer (BE-30). Plain array scans — the tables
 * hold hundreds of rows; do NOT grow an index/query layer here (threshold
 * notes in API-SPEC §1-3).
 */

export async function memberPickers(): Promise<
  { id: string; name: string; department: string }[]
> {
  const members = await getTable("members");
  return members
    .filter((m) => m.status !== "withdrawn")
    .map((m) => ({ id: m.id, name: m.name, department: m.department }));
}

/**
 * 관리자 기록 편집기(출석·발표자)의 명단 — memberPickers에 옛 id를 더한다.
 * 재가입 회원이 이주된 기록에 옛 id로 남아 있어도 그 칸이 체크로 보이게
 * (domain/recorded-people).
 */
export async function recordPickers(): Promise<PickerMember[]> {
  const members = await getTable("members");
  return members
    .filter((m) => m.status !== "withdrawn")
    .map((m) => ({
      id: m.id,
      name: m.name,
      department: m.department,
      legacyMemberId: m.legacyMemberId,
    }));
}

/**
 * 기록 정정용 명단 — 통합 디렉터리 전원(탈퇴자·옛 회원 포함, 재가입 회원은
 * 새 행 하나). 스터디 참가자 편집기(D-000057)와 종료 스터디 주최자 지정
 * (D-000054)만 쓴다. 운영 명단 회원이 먼저, `former`(운영 명단 밖이거나
 * 탈퇴)는 뒤에.
 */
export async function directoryPickers(): Promise<DirectoryPicker[]> {
  const [directory, members] = await Promise.all([
    getMemberDirectory(),
    getTable("members"),
  ]);
  const operating = new Set(
    members.filter((m) => m.status !== "withdrawn").map((m) => m.id),
  );
  const pickers = directory.map((m) => ({
    id: m.id,
    name: m.name,
    department: m.department,
    legacyMemberId: m.legacyMemberId,
    former: !operating.has(m.id),
  }));
  return [
    ...pickers.filter((p) => !p.former),
    ...pickers.filter((p) => p.former),
  ];
}

export async function getMemberById(id: string): Promise<Member | null> {
  return (await getTable("members")).find((m) => m.id === id) ?? null;
}

export async function getPrivateInfoOf(
  memberId: string,
): Promise<PrivateInfo | null> {
  return (
    (await getTable("private-info")).find((p) => p.memberId === memberId) ??
    null
  );
}

export async function getActivitiesBetween(
  start: Date,
  end: Date,
): Promise<Activity[]> {
  // 취소·미공개 세미나의 활동은 회원·게스트 어느 쪽에도 나가지 않는다.
  const activities = await withoutHiddenActivities(
    await getTable("activities"),
  );
  return activities.filter((a) => {
    const d = new Date(a.date.start);
    return d >= start && d < end;
  });
}

export async function getActivitiesOf(
  ...memberIds: (string | null)[]
): Promise<Activity[]> {
  // S9: 재가입 회원은 legacy id의 과거 기록도 본인 것이다 — 복수 id 매칭.
  const ids = memberIds.filter((id): id is string => !!id);
  const activities = await withoutHiddenActivities(
    await getTable("activities"),
  );
  return activities.filter((a) => ids.some((id) => a.attendeeIds.includes(id)));
}
