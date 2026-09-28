import { z } from "zod";
import { externalHref } from "$lib/domain/links";
import { MEMBER_STATUSES } from "$lib/domain/members";
import { DateOnly, DateTime, Id, SourceRequestId, Term } from "./common";

// 회원 지위의 닫힌 집합은 도메인이 단일 원천 (audit LA21-1).
export const MemberStatus = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof MemberStatus>;

export const MemberRole = z.object({
  term: Term,
  title: z.string().min(1),
});
export type MemberRole = z.infer<typeof MemberRole>;

/** MEM-07 lifecycle state. previousStatus restores on self-cancellation. */
export const Withdrawal = z.object({
  requestedAt: DateTime,
  previousStatus: MemberStatus.exclude(["withdrawn"]),
  holdBy: Id.nullable(),
  holdAt: DateTime.nullable(),
});

export const MemberSchema = z.object({
  id: Id,
  name: z.string().min(1),
  department: z.string(),
  // Every new row carries one: approval (flow_approve_application, the one
  // path that creates a member) stamps the legacy join date or today and
  // refuses anything else, and the admin edit requires a date. null is still
  // decoded so a row predating that rule — or a legacy-members row — reads;
  // the admin record form lets an admin fill it (decision #3, audit LC11-3).
  joinedAt: DateOnly.nullable(),
  status: MemberStatus,
  statusChangedAt: DateTime,
  withdrawal: Withdrawal.nullable(),
  isAlumni: z.boolean(),
  // Sticky revocation flag: once true, promotion to regular must NOT restore isAlumni.
  alumniRevoked: z.boolean(),
  // 유고 박탈 사유 — on the member row so it goes wherever the row goes
  // (deletion, anonymization); the append-only audit log records only
  // { hasReason: true } (decision #18, audit LA30-1). null: never revoked,
  // or revoked before the field existed (that reason is in the audit log).
  alumniRevocationReason: z.string().nullable(),
  roles: z.array(MemberRole),
  isAdmin: z.boolean(),
  // DEPRECATED — written by nobody, read by nobody (decision #19, audit
  // LB16-3). The public executive contact is the private-info phone with
  // the hidePublicPhone opt-out (operator decision 2026-09-01). Kept so
  // stored rows and backups still decode; new rows carry null.
  publicContact: z.string().nullable(),
  // The URL becomes a public link: http(s) only, stored as well as input
  // (audit LA21-2) — a row written past the form must not carry javascript:.
  project: z
    .object({
      title: z.string(),
      url: z
        .string()
        .refine((v) => externalHref(v) !== null, "http(s) URL only")
        .optional(),
    })
    .nullable(),
  // S9: 재가입 승인 시 이메일로 자동 매칭된 legacy-members 행 — 과거 활동 기록 연결용.
  legacyMemberId: Id.nullable().default(null),
  sourceRequestId: SourceRequestId,
});

export type Member = z.infer<typeof MemberSchema>;
