/**
 * 비가시 문자 제거 (S7~ 실측): soft hyphen(U+00AD)·zero-width(U+200B~200D)·
 * BOM(U+FEFF)·word joiner(U+2060). 노션 이주분(57건)뿐 아니라 구글 프로필
 * 이름을 통해 런타임에도 유입된다(가입 신청 실측 1건) — 데이터가 되는 입력은
 * 전부 이걸 거친다. scripts/migration/lib.ts stripInvisibles의 앱 측 미러.
 */
export function stripInvisibles(text: string): string {
  return text.replace(/[­​-‍﻿⁠]/g, "");
}
