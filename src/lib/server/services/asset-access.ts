import { getTable } from "$lib/server/data/tables";

/**
 * 자산 한 개를 **누가** 받을 수 있는가.
 *
 * 공개 버킷을 비공개로 돌리면 "URL을 아는 사람"이 더는 권한이 아니게 된다.
 * 그 자리를 이 함수가 대신한다 — 규칙은 화면과 같다(결정: 페이지와 동일 규칙).
 *
 * - `public`: 공개된 세미나의 자료·사진·포스터, 스터디·회식 사진 — 게스트 포함
 * - `admin` : 미공개·취소된 세미나의 자산, 심사 중인 신청의 포스터
 * - `none`  : **어느 기록에도 속하지 않는 키** — 지워진 기록의 잔여 파일,
 *             오타 경로, 추측 경로. 기본값이 허용이면 그것들이 그대로 샌다.
 */
export type AssetAccess = "public" | "admin" | "none";

export async function resolveAssetAccess(key: string): Promise<AssetAccess> {
  if (!key || key.includes("..")) return "none";

  const [seminars, requests, studies, dinners] = await Promise.all([
    getTable("seminars"),
    getTable("seminar-requests"),
    getTable("studies"),
    getTable("gallery-dinner"),
  ]);

  for (const seminar of seminars) {
    const owns =
      seminar.posterKey === key ||
      seminar.materials.includes(key) ||
      seminar.photos.includes(key);
    // 세미나의 자산은 세미나와 같은 운명을 따른다 — 공개된 것만 공개다.
    if (owns)
      return seminar.publicationStatus === "published" ? "public" : "admin";
  }

  // 신청 포스터가 그려지는 곳은 관리자 심사 화면뿐이다.
  if (requests.some((request) => request.posterKey === key)) return "admin";

  if (studies.some((study) => study.photos.includes(key))) return "public";
  if (dinners.some((dinner) => dinner.photos.includes(key))) return "public";

  return "none";
}
