import { z } from "zod/v4";

/**
 * 세미나 영상 링크 — 녹화·관련 영상의 외부 링크 목록, 링크마다 선택 제목
 * (snumps-webpage/D-000010, D-000014). 노션 원본에서는 페이지 본문에 쪽당
 * 1~3개가 있었다. 저장 규칙(server/data/schemas/seminar.ts)과 같은 상한을
 * 여기 한 곳에 둔다.
 */
export const SEMINAR_VIDEO_LIMITS = {
  count: 10,
  title: 80,
  // 신청서의 외부 첨부 URL과 같은 상한
  url: 2_048,
} as const;

export interface SeminarVideo {
  url: string;
  title: string;
}

const INVISIBLES = /[\u00AD\u200B-\u200D\uFEFF\u2060]/g;
const clean = (text: string) => text.replace(INVISIBLES, "").trim();

const videoSchema = z.object({
  url: z
    .string()
    .min(1, "영상 링크를 입력해 주세요.")
    .max(
      SEMINAR_VIDEO_LIMITS.url,
      `영상 링크는 ${SEMINAR_VIDEO_LIMITS.url.toLocaleString()}자 이하로 입력해 주세요.`,
    )
    .pipe(
      z.url({
        protocol: /^https$/,
        error: "영상 링크는 https:// 로 시작하는 주소여야 합니다.",
      }),
    ),
  title: z
    .string()
    .max(
      SEMINAR_VIDEO_LIMITS.title,
      `영상 제목은 ${SEMINAR_VIDEO_LIMITS.title}자 이하로 입력해 주세요.`,
    ),
});

const videosSchema = z
  .array(videoSchema)
  .max(
    SEMINAR_VIDEO_LIMITS.count,
    `영상은 ${SEMINAR_VIDEO_LIMITS.count}개까지 넣을 수 있습니다.`,
  );

/**
 * 기록 편집기의 영상 행(`videoUrl`·`videoTitle`이 같은 순서로 반복)을 읽는다.
 * URL·제목이 모두 빈 행은 편집기가 남긴 빈 칸이라 버린다. 제목만 있는 행은
 * 링크가 빠진 입력 실수로 보고 거부한다.
 */
export function parseSeminarVideosForm(
  formData: FormData,
): { success: true; data: SeminarVideo[] } | { success: false; issue: string } {
  const text = (v: FormDataEntryValue) => (typeof v === "string" ? v : "");
  const urls = formData.getAll("videoUrl").map(text);
  const titles = formData.getAll("videoTitle").map(text);
  const rows = urls
    .map((url, i) => ({ url: clean(url), title: clean(titles[i] ?? "") }))
    .filter((row) => row.url !== "" || row.title !== "");
  const parsed = videosSchema.safeParse(rows);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, issue: parsed.error.issues[0].message };
}
