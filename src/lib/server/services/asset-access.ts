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

  // 한 키를 여러 기록이 가리킬 수 있다. **세미나끼리** 겹치면 가장 엄격한 쪽을
  // 따른다 — 표의 순서가 정책을 정하게 두지 않는다.
  let verdict: AssetAccess = "none";
  let ownedBySeminar = false;
  const restrict = (next: Exclude<AssetAccess, "none">) => {
    if (next === "admin" || verdict === "none") verdict = next;
  };

  for (const seminar of seminars) {
    const owns =
      seminar.posterKey === key ||
      seminar.materials.includes(key) ||
      seminar.photos.includes(key);
    // 세미나의 자산은 세미나와 같은 운명을 따른다 — 공개된 것만 공개다.
    if (owns) {
      ownedBySeminar = true;
      restrict(seminar.publicationStatus === "published" ? "public" : "admin");
    }
  }

  // 신청 포스터가 그려지는 곳은 관리자 심사 화면뿐이다.
  //
  // 다만 **세미나가 이미 그 키를 갖고 있으면 신청은 판정에 끼어들지 않는다.**
  // 승인이 `posterKey`를 그대로 물려받으므로(seminar-requests.ts), 신청 흐름으로
  // 올라온 세미나는 공개된 뒤에도 신청 행과 같은 키를 공유한다. 여기서 신청을
  // 이유로 관리자 전용으로 끌어내리면 **정상적으로 공개된 세미나의 포스터가
  // 게스트에게 404가 된다** — 예외가 아니라 보통 경로다(실측).
  if (
    !ownedBySeminar &&
    requests.some((request) => request.posterKey === key)
  ) {
    restrict("admin");
  }

  if (studies.some((study) => study.photos.includes(key))) restrict("public");
  if (dinners.some((dinner) => dinner.photos.includes(key))) restrict("public");

  return verdict;
}
