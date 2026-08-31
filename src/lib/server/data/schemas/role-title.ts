import { z } from "zod";
import { DateTime, Id } from "./common";

/**
 * 임원 직위 옵션 (관리자 대시보드에서 추가하는 커스텀 직위).
 * 기본 직위(회장·부회장 등)는 코드에 있고(services/executives-admin.ts),
 * 이 테이블은 추가분만 담는다. 직위 문자열 자체는 member.roles[].title에
 * 저장되므로, 옵션 삭제는 과거 배정 기록에 영향을 주지 않는다.
 */
export const RoleTitleSchema = z.object({
  id: Id,
  title: z.string().min(1),
  updatedAt: DateTime,
});

export type RoleTitle = z.infer<typeof RoleTitleSchema>;
