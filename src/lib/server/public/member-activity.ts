import { getDirectoryIndex } from "$lib/server/data/directory";
import { getTable } from "$lib/server/data/tables";
import type { Member } from "$lib/server/data/schemas";
import { withoutHiddenActivities } from "$lib/server/services/visibility";
import {
  memberActivity,
  type MemberActivity,
} from "$lib/domain/member-activity";

/**
 * 멤버별 활동 정도의 로드 (snumps-webpage/D-000041·042·051).
 *
 * 공개 집계(`publicOnly`)는 회원 면의 숨김 규칙을 그대로 쓴다 — 가려진 활동은
 * `withoutHiddenActivities`, 세미나는 공개 아카이브와 같은 기준(공개된 것만,
 * `routes/(public)/archive/+layout.server.ts`). 관리자 화면은 전부를 센다.
 *
 * 신원은 표시용 통합 디렉터리를 따른다(`data/directory.ts`): 이주된 기록은
 * legacy id를, 재가입 회원의 새 행은 `legacyMemberId`로 그것을 가리키므로
 * 한 사람의 id는 둘일 수 있다.
 */

/** 이 사람의 기록이 가리킬 수 있는 id 전부 — 새 id와 잇는 legacy id. */
function personIds(member: Pick<Member, "id" | "legacyMemberId">) {
  return new Set(
    [member.id, member.legacyMemberId].filter((id): id is string => !!id),
  );
}

export async function memberActivityIndex({
  publicOnly,
}: {
  publicOnly: boolean;
}): Promise<(member: Member) => MemberActivity> {
  const [seminars, studies, allActivities] = await Promise.all([
    getTable("seminars"),
    getTable("studies"),
    getTable("activities"),
  ]);
  const activities = publicOnly
    ? await withoutHiddenActivities(allActivities)
    : allActivities;
  const data = {
    seminars: publicOnly
      ? seminars.filter((s) => s.publicationStatus === "published")
      : seminars,
    studies,
    activities: activities.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      start: a.date.start,
      end: a.date.end,
      attendeeIds: a.attendeeIds,
    })),
  };
  const now = new Date();
  return (member) => memberActivity(personIds(member), data, now);
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
export async function getPublicMember(
  id: string,
): Promise<
  | { member: PublicMemberProfile; activity: MemberActivity }
  | { redirectTo: string }
  | null
> {
  const [index, activityOf] = await Promise.all([
    getDirectoryIndex(),
    memberActivityIndex({ publicOnly: true }),
  ]);
  const m = index.get(id);
  if (!m || m.status === "withdrawn") return null;
  if (m.id !== id)
    return { redirectTo: `/members/${encodeURIComponent(m.id)}` };
  return {
    member: {
      id: m.id,
      name: m.name,
      department: m.department,
      joinedAt: m.joinedAt,
      roles: m.roles,
    },
    activity: activityOf(m),
  };
}
