import type {
  MemberPickerItem,
  SeminarFormIssues,
  SeminarRequestFormValues,
} from "./seminars";

export interface SeminarProposalActionState {
  success?: boolean;
  operation?: "requestSubmitted" | "requestUpdated" | "requestWithdrawn";
  requestId?: string;
  error?: string;
  message?: string;
  issues?: SeminarFormIssues;
  values?: Partial<SeminarRequestFormValues>;
}

/** Preserve an explicitly empty selection and stored IDs whose names are unavailable. */
export function initialSeminarPresenters(
  members: readonly MemberPickerItem[],
  ids: readonly string[] | undefined,
  fallback: readonly MemberPickerItem[],
): MemberPickerItem[] {
  if (ids === undefined) return [...fallback];
  const byId = new Map(members.map((member) => [member.id, member]));
  return [...new Set(ids)].map(
    (id) =>
      byId.get(id) ?? {
        id,
        name: "정보를 확인할 수 없는 발표자",
        department: "회원 목록 확인 필요",
      },
  );
}
