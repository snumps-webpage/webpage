/**
 * 출석·발표자 편집기의 체크 목록 (snumps-webpage/D-000047~49).
 *
 * 선택지는 운영 명단(비탈퇴)이다. 그런데 이주된 기록의 id는 legacy id라서
 * 명단만 보여 주면 그 사람들이 체크로 보이지 않고, 저장하면 지워진다. 그래서
 * - 재가입 회원은 기록에 남은 옛 id로 체크·제출한다(저장값이 바뀌지 않게).
 * - 명단에 없는 기록된 사람(옛 회원·탈퇴 회원)은 따로 체크된 채 보여 준다 —
 *   보존하거나 빼는 것만 되고, 새로 넣을 수는 없다.
 */

export type PickerMember = {
  id: string;
  name: string;
  department: string;
  legacyMemberId: string | null;
};

/** 명단 한 칸이 제출할 id와 체크 여부. */
export function pickerChoice(
  member: Pick<PickerMember, "id" | "legacyMemberId">,
  recordedIds: readonly string[],
): { value: string; checked: boolean } {
  if (recordedIds.includes(member.id))
    return { value: member.id, checked: true };
  if (member.legacyMemberId && recordedIds.includes(member.legacyMemberId))
    return { value: member.legacyMemberId, checked: true };
  return { value: member.id, checked: false };
}

/** 기록된 사람 중 명단 어느 칸도 나타내지 못하는 id — 기록 순서, 한 번씩. */
export function formerIds(
  recordedIds: readonly string[],
  pickers: readonly Pick<PickerMember, "id" | "legacyMemberId">[],
): string[] {
  const shown = new Set(
    pickers.flatMap((p) =>
      p.legacyMemberId ? [p.id, p.legacyMemberId] : [p.id],
    ),
  );
  return [...new Set(recordedIds)].filter((id) => !shown.has(id));
}
