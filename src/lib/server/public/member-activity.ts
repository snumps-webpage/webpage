import { getDirectoryIndex } from "$lib/server/data/directory";
import { getTable } from "$lib/server/data/tables";
import { currentTerm } from "$lib/server/core/semester";
import type { Member } from "$lib/server/data/schemas";
import {
  memberActivity,
  memberActivityData,
  memberStanding,
  personIdsOf,
  registeredIdsOf,
  type HiddenFromPublic,
  type MemberActivity,
  type MemberStanding,
} from "$lib/domain/member-activity";

/**
 * 회원별 활동 기록과 회칙 기준 지위의 로드 (snumps-webpage/D-000063·064·070·
 * 074·077·078).
 *
 * 공개 집계(`publicOnly`)는 회원 면의 숨김 규칙을 그대로 쓴다 — 가려진 활동은
 * `hiddenActivityIdsOf`, 세미나는 공개 아카이브와 같은 기준(공개된 것만,
 * `routes/(public)/archive/+layout.server.ts`), 취소된 스터디는 주최 목록에서
 * 뺀다(D-000064) — 규칙은 순수 모듈의 `memberActivityData`. 관리자 화면은 전부를 보이되 공개 면에서 빠지는 것을
 * `hiddenFromPublic`으로 표시한다(D-000069). 활동 기록 수는 어느 쪽이든 숨김
 * 활동을 세지 않으므로 같다.
 *
 * 신원은 표시용 통합 디렉터리를 따른다(`data/directory.ts`): 이주된 기록은
 * legacy id를, 재가입 회원의 새 행은 `legacyMemberId`로 그것을 가리키므로
 * 한 사람의 id는 둘일 수 있다. 이번 학기 등록도 두 id 어느 쪽이든 그 사람의 것이다.
 */

export type MemberRecord = {
  activity: MemberActivity;
  /** 회칙 기준 지위 — 탈퇴 회원은 null. */
  standing: MemberStanding | null;
  registeredThisTerm: boolean;
};

export type MemberActivityIndex = {
  of(member: Member): MemberRecord;
  /** 공개 면에서 빠지는 것 — 관리자 화면의 '공개 면 숨김' 표시용. */
  hiddenFromPublic: HiddenFromPublic;
};

export async function memberActivityIndex({
  publicOnly,
  now = new Date(),
}: {
  publicOnly: boolean;
  now?: Date;
}): Promise<MemberActivityIndex> {
  const [seminars, studies, activities, events, registrations] =
    await Promise.all([
      getTable("seminars"),
      getTable("studies"),
      getTable("activities"),
      getTable("events"),
      getTable("registrations"),
    ]);
  const { data, hiddenFromPublic } = memberActivityData(
    { seminars, studies, activities, events },
    { publicOnly },
  );
  const registeredIds = registeredIdsOf(registrations, currentTerm(now));

  return {
    hiddenFromPublic,
    of(member) {
      const ids = personIdsOf(member);
      const activity = memberActivity(ids, data);
      const registeredThisTerm = [...ids].some((id) => registeredIds.has(id));
      return {
        activity,
        registeredThisTerm,
        standing:
          member.status === "withdrawn"
            ? null
            : memberStanding({
                registeredThisTerm,
                storedStatus: member.status,
                isAlumni: member.isAlumni,
                records: activity.records,
              }),
      };
    },
  };
}

/** 공개 회원 페이지의 신원 — 명단과 같은 D2 공개 필드만. */
export type PublicMemberProfile = Pick<
  Member,
  "id" | "name" | "department" | "joinedAt" | "roles"
>;

/**
 * 공개 회원 페이지 하나. id는 운영 회원 id 또는 legacy id다.
 *
 * - 재가입 회원의 legacy id → 새 id의 주소(`redirectTo`): 한 사람에 주소 하나.
 * - 탈퇴했거나 없는 id → null. 공개 명단이 탈퇴 회원을 빼는 것과 같은 규칙이다.
 */
export async function getPublicMember(id: string): Promise<
  | {
      member: PublicMemberProfile;
      standing: MemberStanding;
      activity: MemberActivity;
    }
  | { redirectTo: string }
  | null
> {
  const [directory, index] = await Promise.all([
    getDirectoryIndex(),
    memberActivityIndex({ publicOnly: true }),
  ]);
  const m = directory.get(id);
  if (!m || m.status === "withdrawn") return null;
  if (m.id !== id)
    return { redirectTo: `/members/${encodeURIComponent(m.id)}` };
  const { activity, standing } = index.of(m);
  if (!standing) return null; // 탈퇴 — 위에서 이미 걸렀다
  return {
    member: {
      id: m.id,
      name: m.name,
      department: m.department,
      joinedAt: m.joinedAt,
      roles: m.roles,
    },
    standing,
    activity,
  };
}
