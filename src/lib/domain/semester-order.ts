/**
 * 학기 정렬 규칙. 브라우저에서도 쓰이므로 `$lib/server` 밖에 산다 — 서버
 * 모듈을 도메인이 끌어오면 SvelteKit이 빌드를 막는다(실측: 프로젝트 아카이브
 * 페이지가 이 경로로 서버 모듈을 끌어와 빌드가 깨져 있었다).
 *
 * 한 해 안의 시간 순서: 1학기(3~8월) → 여름 → 2학기(9~익년 2월) → 겨울.
 * 단순 문자열 비교는 "26-S"/"26-W"를 "26-2" 뒤로 보내, 방학 기록이 그 뒤에
 * 오는 학기보다 위에 오게 만든다(W-7).
 */
const HALF_ORDER: Record<string, number> = { "1": 0, S: 1, "2": 2, W: 3 };

export function compareSemesters(a: string, b: string): number {
  const [ay, ah] = a.split("-");
  const [by, bh] = b.split("-");
  if (ay !== by) return ay.localeCompare(by);
  return (HALF_ORDER[ah] ?? 99) - (HALF_ORDER[bh] ?? 99);
}
