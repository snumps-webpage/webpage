import { z } from "zod";
import { DateOnly, DateTime, Id, SourceRequestId, Term } from "./common";

export const MemberStatus = z.enum(["associate", "regular", "withdrawn"]);
export type MemberStatus = z.infer<typeof MemberStatus>;

export const MemberRole = z.object({
  term: Term,
  title: z.string().min(1),
});
export type MemberRole = z.infer<typeof MemberRole>;

/** MEM-07 lifecycle state. previousStatus restores on self-cancellation. */
export const Withdrawal = z.object({
  requestedAt: DateTime,
  previousStatus: z.enum(["associate", "regular"]),
  holdBy: Id.nullable(),
  holdAt: DateTime.nullable(),
});

export const MemberSchema = z.object({
  id: Id,
  name: z.string().min(1),
  department: z.string(),
  joinedAt: DateOnly.nullable(),
  status: MemberStatus,
  statusChangedAt: DateTime,
  withdrawal: Withdrawal.nullable(),
  isAlumni: z.boolean(),
  // Sticky revocation flag: once true, promotion to regular must NOT restore isAlumni.
  alumniRevoked: z.boolean(),
  roles: z.array(MemberRole),
  isAdmin: z.boolean(),
  // The single sanctioned public-contact field (API-SPEC §3 exception).
  publicContact: z.string().nullable(),
  project: z.object({ title: z.string(), url: z.string().optional() }).nullable(),
  // S9: 재가입 승인 시 이메일로 자동 매칭된 legacy-members 행 — 과거 활동 기록 연결용.
  legacyMemberId: Id.nullable().default(null),
  sourceRequestId: SourceRequestId,
});

export type Member = z.infer<typeof MemberSchema>;
