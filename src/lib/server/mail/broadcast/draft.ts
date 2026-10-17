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
 * `cid:<contentId>`로 되돌림. `img`의 `src`만 다루고, pathname 끝으로 판정(쿼리·토큰
 * 무시, 퍼센트 인코딩 해석 후). 다른 업로드·알 수 없는 n·다른 확장자는 그대로.
 */
export function restoreCids(
  html: string,
  s3Key: string,
  images: PreviewImage[],
): string {
  const prefix = `${keyBase(s3Key)}/preview/`;
  const byName = new Map(images.map((i) => [`${i.n}.${i.ext}`, i.contentId]));
  const restore = (src: string): string | null => {
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
    return cid === undefined ? null : `cid:${cid}`;
  };
  // 속성 단위로 읽어 값 안의 `>`·` src=` 문자열에 속지 않음. 첫 `src` 속성만 다룸.
  return html.replace(IMG_TAG, (tag) => {
    let seen = false;
    return tag.replace(
      IMG_ATTR,
      (
        m,
        lead: string,
        name: string,
        dq?: string,
        sq?: string,
        bare?: string,
      ) => {
        if (seen || name.toLowerCase() !== "src") return m;
        seen = true;
        const value = dq ?? sq ?? bare;
        if (value === undefined) return m;
        const next = restore(value);
        if (next === null) return m;
        const q = sq !== undefined ? "'" : '"';
        return `${lead}${q}${next}${q}`;
      },
    );
  });
}

const ATTR = String.raw`\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>\x60]+))?`;
const IMG_TAG = new RegExp(String.raw`<img(?:${ATTR})*\s*/?>`, "gi");
const IMG_ATTR = new RegExp(
  String.raw`(\s+([^\s"'<>/=]+)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'<>\x60]+))`,
  "g",
);
