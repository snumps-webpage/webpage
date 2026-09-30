import { z } from "zod";
import { DateTime, Id } from "./common";

/**
 * 역대 회장단 공개 프로필 — 사람당 한 행(도메인: $lib/domain/executive-profile).
 * `memberId`는 명부 id다: 운영 회원이면 운영 id, 재가입하지 않은 옛 회원이면
 * legacy id. 재가입한 사람은 저장할 때 운영 id로 옮겨 적는다.
 *
 * `member` 출처는 값을 담지 않는다 — 공개 시점에 회원 DB에서 읽는다(연동).
 * 행이 없으면 아무것도 공개하지 않는다.
 */
const Hidden = z.object({ source: z.literal("hidden") });
const Custom = z.object({
  source: z.literal("custom"),
  value: z.string().min(1),
});

export const ProfileField = z.discriminatedUnion("source", [
  Hidden,
  z.object({ source: z.literal("member") }),
  Custom,
]);

export const ExecutiveProfileSchema = z.object({
  id: Id,
  memberId: Id,
  department: ProfileField,
  cohort: ProfileField,
  email: ProfileField,
  // 근황은 회원 DB에 원천이 없다 — 연동이 없다.
  bio: z.discriminatedUnion("source", [Hidden, Custom]),
  updatedAt: DateTime,
  updatedBy: Id,
});

export type ExecutiveProfile = z.infer<typeof ExecutiveProfileSchema>;
