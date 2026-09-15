import { describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ dev: false }));

import { thumbSrcset, thumbUrl } from "./image";

/**
 * 자산이 `/media/<key>`(권한을 확인하는 앱 경로)로 오면서, "http로 시작하지
 * 않으면 그대로 돌려준다"는 규칙이 갤러리 전체를 **원본 크기**로 되돌려 놓았다 —
 * 사진 한 장이 최대 10MB다. 같은 출처의 절대 경로는 Vercel 이미지 최적화가
 * 그대로 받으므로, 프록시 경로도 최적화를 태운다.
 *
 * 빈 문자열은 여전히 그대로 둔다: URL이 없다는 뜻이고, 소비자의 `{#if url}`
 * 가드가 서야 한다(W-8).
 */
describe("thumbUrl", () => {
  it("권한 프록시 경로도 최적화를 태운다", () => {
    expect(thumbUrl("/media/seminars/s1/a.jpg", 640)).toBe(
      "/_vercel/image?url=%2Fmedia%2Fseminars%2Fs1%2Fa.jpg&w=640&q=72",
    );
  });

  it("외부 절대 URL은 그대로 최적화를 태운다", () => {
    expect(thumbUrl("https://cdn.example/a.jpg", 480)).toContain(
      "%2F%2Fcdn.example%2Fa.jpg",
    );
  });

  it("빈 문자열은 빈 문자열로 남는다", () => {
    expect(thumbUrl("", 640)).toBe("");
  });

  it("srcset도 프록시 경로를 다룬다", () => {
    const srcset = thumbSrcset("/media/seminars/s1/a.jpg");

    expect(srcset).toContain("480w");
    expect(srcset).toContain("%2Fmedia%2F");
  });

  it("URL이 없으면 srcset도 없다", () => {
    expect(thumbSrcset("")).toBeUndefined();
  });
});
