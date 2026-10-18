import type { MailBroadcastDraft } from "$lib/server/data/schemas";
import {
  readStaged,
  removeStaged,
  uploadStaged,
} from "$lib/server/data/storage";
import { getTable, mutate } from "$lib/server/data/tables";

/** `.eml` 키에서 확장자를 뗀 경로 (미리보기·초안 객체의 기준 경로). */
export const keyBase = (s3Key: string) => s3Key.replace(/\.[^./]+$/, "");

/** 초안 id — 확장자 뗀 키의 마지막 부분. */
export const draftId = (s3Key: string): string =>
  keyBase(s3Key).split("/").pop() ?? "";

/** 편집 HTML이 놓이는 staging 경로. */
export const draftHtmlPath = (s3Key: string): string =>
  `${keyBase(s3Key)}/draft.html`;

/** 로그에는 오류 종류만 — 경로·본문·주소는 남기지 않음. */
function describeError(e: unknown): string {
  return e instanceof Error ? e.name : "unknown error";
}

/** 초안 행과 본문. 행이 없으면 null, 파일만 없으면 `html: null`. */
export async function readDraft(
  s3Key: string,
): Promise<{ row: MailBroadcastDraft; html: string | null } | null> {
  const rows = await getTable("mail-broadcast-drafts");
  const row = rows.find((r) => r.s3Key === s3Key);
  if (!row) return null;
  const bytes = await readStaged(draftHtmlPath(s3Key));
  if (!bytes) {
    console.error("[Broadcast] draft row without html file");
    return { row, html: null };
  }
  return { row, html: new TextDecoder().decode(bytes) };
}

/** 파일 먼저(덮어쓰기), 그다음 같은 id 행 교체. */
export async function writeDraft(
  row: MailBroadcastDraft,
  html: string,
): Promise<void> {
  await uploadStaged(
    draftHtmlPath(row.s3Key),
    new TextEncoder().encode(html),
    "text/html",
  );
  await mutate("mail-broadcast-drafts", (rows) => [
    ...rows.filter((r) => r.id !== row.id),
    row,
  ]);
}

/** 행과 파일을 지운다. 각각의 실패는 로그만 남기고 넘어감. */
export async function deleteDraft(s3Key: string): Promise<void> {
  const id = draftId(s3Key);
  try {
    await mutate("mail-broadcast-drafts", (rows) =>
      rows.filter((r) => r.id !== id),
    );
  } catch (e) {
    console.error("[Broadcast] draft row delete failed:", describeError(e));
  }
  try {
    await removeStaged([draftHtmlPath(s3Key)]);
  } catch (e) {
    console.error("[Broadcast] draft file delete failed:", describeError(e));
  }
}

export interface PreviewImage {
  n: number;
  ext: string;
  contentId: string;
}

/**
 * 편집기가 돌려준 HTML에서 미리보기 서명 주소(`…/<키-확장자>/preview/<n>.<ext>`)를
 * `cid:<contentId>`로 되돌림. `signPreviewImages`가 `cid:`를 모든 위치(img src, style
 * 속성·`<style>`의 url(), href 등)에서 바꾸므로 되돌리기도 HTML 전체의 `http(s)://` 주소를
 * 훑음(D-000207). pathname 끝으로 판정(쿼리·토큰 무시, 퍼센트 인코딩 해석 후).
 * 다른 업로드·알 수 없는 n·다른 확장자는 그대로.
 * 바꾸는 범위는 서명 주소의 실제 형태(경로 + 서명 쿼리)까지만이고, 주소에 바로 붙은
 * 글자(`.` `!` `#frag` `&lt;` 한글 등)는 남김(D-000216-a).
 */
export function restoreCids(
  html: string,
  s3Key: string,
  images: PreviewImage[],
): string {
  const prefix = `${keyBase(s3Key)}/preview/`;
  const byName = new Map(images.map((i) => [`${i.n}.${i.ext}`, i.contentId]));
  /** 바꿀 `cid:` 참조와, `src`에서 서명 주소가 끝나는 위치. */
  const restore = (src: string): { cid: string; end: number } | null => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(src).pathname);
    } catch {
      return null;
    }
    const at = pathname.lastIndexOf(prefix);
    if (at === -1) return null;
    // 키 앞은 경로 경계여야 함 (`x<키>`처럼 접미사만 같은 경우 제외)
    if (at > 0 && pathname[at - 1] !== "/") return null;
    const name = pathname.slice(at + prefix.length);
    const cid = byName.get(name);
    if (cid === undefined) return null;
    // 경로는 첫 `?`·`#` 앞까지. `?`면 서명 쿼리 토큰까지만 주소로 보고 나머지는 남김.
    const stop = src.search(/[?#]/);
    if (stop === -1) return { cid, end: src.length };
    if (src[stop] === "#") return { cid, end: stop };
    SIGNED_QUERY.lastIndex = stop + 1;
    const q = SIGNED_QUERY.exec(src);
    // JWT·exp 값은 `.`로 끝나지 않으므로 끝의 `.`은 문장 부호로 보고 남김
    const query = q === null ? "" : q[0].replace(/\.+$/, "");
    return { cid, end: stop + (query === "" ? 0 : 1 + query.length) };
  };
  return html.replace(URL_IN_HTML, (url) => {
    const r = restore(url);
    return r === null ? url : `cid:${r.cid}${url.slice(r.end)}`;
  });
}

/**
 * 공백·따옴표·`<>()`·백틱·`,`, 그리고 따옴표·`&nbsp;` 엔티티 앞에서 끝나는
 * `http(s)://` 덩어리. 쿼리의 `&amp;`는 주소의 일부로 계속 감. 분기가 서로 겹치지
 * 않아 역추적 없는 선형 정규식 (D-000211).
 */
const URL_IN_HTML =
  /https?:\/\/(?:[^\s"'<>(),&\x60]|&(?!(?:quot|apos|nbsp|#34|#39|#x22|#x27);))+/gi;

/**
 * 서명 쿼리: `키=값`을 `&amp;`로 이은 것. 문자는 ASCII 토큰 문자(`[A-Za-z0-9._~%-]`)만
 * (Supabase JWT·메모리 백엔드 `exp`). 키·값 문자 집합에 `=`·`&`가 없어 역추적 없는
 * 선형 정규식 (D-000216-a).
 */
const SIGNED_QUERY =
  /[\w.~%-]+(?:=[\w.~%-]*)?(?:&amp;[\w.~%-]+(?:=[\w.~%-]*)?)*/y;
