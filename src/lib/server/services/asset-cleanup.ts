import { getTableFresh } from "$lib/server/data/tables";
import { removeAssets } from "$lib/server/data/storage";

/**
 * 지금 이 순간 어느 기록이든 가리키고 있는 자산 키 전부. 캐시가 아니라 저장소를
 * 직접 읽는다 — 캐시는 다른 인스턴스의 쓰기를 15초까지 못 보고, 이 판정 뒤에는
 * 되돌릴 수 없는 삭제가 온다(LB18-1).
 */
async function referencedAssetKeys(): Promise<Set<string>> {
  const [seminars, requests, studies, dinners] = await Promise.all([
    getTableFresh("seminars"),
    getTableFresh("seminar-requests"),
    getTableFresh("studies"),
    getTableFresh("gallery-dinner"),
  ]);
  const keys = new Set<string>();
  for (const s of seminars) {
    for (const k of [...s.materials, ...s.photos, s.posterKey])
      if (k) keys.add(k);
  }
  for (const r of requests) if (r.posterKey) keys.add(r.posterKey);
  for (const s of studies) for (const k of s.photos) keys.add(k);
  for (const g of dinners) for (const k of g.photos) keys.add(k);
  return keys;
}

/**
 * 기록에서 키를 빼는 것만으로는 파일이 사라지지 않는다. 공개 버킷이던 시절에는
 * 이미 나간 URL이 그 바이트를 영원히 내려 줬고(C-22), 비공개로 돌린 지금도
 * 남은 객체는 용량과 백업 비용으로 남는다.
 *
 * **아직 누군가 가리키고 있으면 지우지 않는다.** 같은 키가 두 기록에 사는 일은
 * 실제로 있다 — 승인은 신청의 `posterKey`를 그대로 물려받는다. 한쪽을 지우면서
 * 바이트까지 없애면 다른 쪽 화면이 404로 깨진다(실측).
 *
 * 실패는 **삼키고 기록한다.** 호출자의 본 동작(기록 편집)은 이미 끝났고, 여기서
 * 던지면 편집 자체가 실패한 것처럼 보인다. 남은 바이트는 백업 미러가 있는 회수
 * 가능한 손해이지만, 편집 불능은 그렇지 않다.
 */
export async function forgetUnreferencedAssets(
  keys: (string | null | undefined)[],
): Promise<void> {
  const wanted = [...new Set(keys.filter((k): k is string => !!k))];
  if (wanted.length === 0) return;
  try {
    const referenced = await referencedAssetKeys();
    const paths = wanted.filter((k) => !referenced.has(k));
    if (paths.length === 0) return;
    await removeAssets(paths);
  } catch (e) {
    console.error(`[assets] delete failed for ${wanted.join(", ")}:`, e);
  }
}
