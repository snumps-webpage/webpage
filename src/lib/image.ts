import { dev } from "$app/environment";

/**
 * Vercel 이미지 최적화 URL 래퍼.
 *
 * 갤러리식 그리드는 저화질(리사이즈+WebP)로, 상세보기는 원본으로 — 원본
 * 파일은 절대 변형·복제하지 않는다. 변환은 Vercel 엣지가 요청 시 수행하고
 * CDN에 캐시된다 (svelte.config.js adapter images 설정과 세트).
 *
 * 로컬 dev에는 /_vercel/image 엔드포인트가 없으므로 원본을 그대로 쓴다.
 * width는 adapter images.sizes에 있는 값이어야 한다 (480|640|960|1280).
 */
export function thumbUrl(src: string, width: 480 | 640 | 960 | 1280 = 640, quality = 72): string {
  if (dev || !src.startsWith("http")) return src;
  return `/_vercel/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

/**
 * 반응형 srcset — 브라우저가 그리드 칸 실측 폭에 맞는 변환본만 받게 한다.
 * dev(최적화 엔드포인트 없음)에서는 undefined → src 단독 사용.
 */
export function thumbSrcset(src: string, quality = 72): string | undefined {
  if (dev || !src.startsWith("http")) return undefined;
  return ([480, 640, 960] as const)
    .map((w) => `${thumbUrl(src, w, quality)} ${w}w`)
    .join(", ");
}
