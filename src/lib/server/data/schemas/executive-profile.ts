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

const HiddenOrCustom = z.discriminatedUnion("source", [Hidden, Custom]);

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
  bio: HiddenOrCustom,
  // 탈퇴 후 표시분 — 탈퇴하면서 고른 항목의 그 시점 값(스냅숏, 이름 포함).
  // 탈퇴 상태일 때만 쓰이고, 탈퇴를 철회하면 위의 설정이 다시 쓰인다.
  // null: 고른 적이 없다(이 기능 전의 탈퇴) — 이름만 남고 프로필은 없다.
  afterWithdrawal: z
    .object({
      name: HiddenOrCustom,
      department: HiddenOrCustom,
      cohort: HiddenOrCustom,
      email: HiddenOrCustom,
      bio: HiddenOrCustom,
    })
    .nullable()
    .default(null),
  updatedAt: DateTime,
  updatedBy: Id,
});

export type ExecutiveProfile = z.infer<typeof ExecutiveProfileSchema>;
