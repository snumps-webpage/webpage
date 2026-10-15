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

/**
 * 기록 정정용 명단 한 칸(스터디 참가자·종료 스터디 주최자, D-000054·057) —
 * 통합 디렉터리 전원. `former`는 운영 명단 밖(옛 회원)이거나 탈퇴한 사람.
 */
export type DirectoryPicker = PickerMember & { former: boolean };

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

/** 스터디 참가자 편집기의 한 칸 — 한 사람(또는 명부가 모르는 기록된 id 하나). */
export type StudyParticipantRow = {
  key: string;
  /** 이 칸이 제출하는 id */
  value: string;
  /** 이 칸이 나타내는 id 전부(새 id + 옛 id) */
  ids: string[];
  name: string;
  department: string;
  former: boolean;
  /** 주최자 — 칸이 잠긴다(주최자는 참가자에서 뺄 수 없다) */
  organizer: boolean;
  /** 지금 참가자로 저장돼 있음 */
  saved: boolean;
};

/**
 * 스터디 참가자 편집기의 칸들(D-000043·057). 통합 명부 한 사람 한 칸, 순서는
 * 주최자 → 저장된 참가자 → 나머지. 칸이 제출하는 id는 저장된 그 id(재가입
 * 회원이 옛 id로 기록돼 있으면 옛 id), 주최자는 주최자로 기록된 id, 아직
 * 참가자가 아니면 출석에 기록된 id, 그것도 없으면 명부 id. 명부가 모르는
 * 기록된 id는 '알 수 없음' 칸으로 남겨 저장 때 지워지지 않게 한다.
 */
export function studyParticipantRows(
  study: {
    organizerIds: readonly string[];
    participantIds: readonly string[];
    attendeeCandidates: readonly string[];
  },
  pickers: readonly DirectoryPicker[],
): StudyParticipantRow[] {
  const people = pickers.map((p) => {
    const ids = p.legacyMemberId ? [p.id, p.legacyMemberId] : [p.id];
    const organizerId = study.organizerIds.find((id) => ids.includes(id));
    const saved = pickerChoice(p, study.participantIds);
    return {
      key: p.id,
      value:
        organizerId ??
        (saved.checked
          ? saved.value
          : pickerChoice(p, study.attendeeCandidates).value),
      ids,
      name: p.name,
      department: p.department,
      former: p.former,
      organizer: organizerId !== undefined,
      saved: saved.checked,
    };
  });
  const unknown = formerIds(
    [...study.organizerIds, ...study.participantIds],
    pickers,
  ).map((id) => ({
    key: id,
    value: id,
    ids: [id],
    name: "알 수 없음",
    department: "",
    former: true,
    organizer: study.organizerIds.includes(id),
    saved: study.participantIds.includes(id),
  }));
  const rank = (r: StudyParticipantRow) => (r.organizer ? 0 : r.saved ? 1 : 2);
  return [...unknown, ...people].sort((a, b) => rank(a) - rank(b));
}

/** '출석자에서 채우기'가 체크할 칸 — 출석에 기록된 id 중 하나라도 나타내는 칸. */
export function attendeeRowKeys(
  rows: readonly StudyParticipantRow[],
  attendeeIds: readonly string[],
): string[] {
  return rows
    .filter((r) => r.ids.some((id) => attendeeIds.includes(id)))
    .map((r) => r.key);
}

/**
 * 관리자 주최자 변경의 선택지(D-000044·054). 종료·취소 스터디(`closed`)는
 * 기록 정정이라 통합 명부 전원 — 기록된 옛 id는 그 id로 다시 제출한다. 모집·
 * 진행 스터디는 운영 명단(비탈퇴)만, 기존 규칙 그대로.
 */
export function organizerChoices(
  closed: boolean,
  organizerIds: readonly string[],
  roster: readonly { id: string; name: string; department: string }[],
  directory: readonly DirectoryPicker[],
): { value: string; label: string; selected: boolean }[] {
  if (!closed)
    return roster.map((m) => ({
      value: m.id,
      label: `${m.name} · ${m.department}`,
      selected: organizerIds.includes(m.id),
    }));
  return directory.map((p) => {
    const choice = pickerChoice(p, organizerIds);
    return {
      value: choice.value,
      label: `${p.name} · ${p.former ? "이전 회원" : p.department}`,
      selected: choice.checked,
    };
  });
}
