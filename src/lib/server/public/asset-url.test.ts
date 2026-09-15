import { afterEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));

import { assetUrl } from "./archive";

/**
 * 자산 URL의 기본값은 **앱 경로**다. 버킷을 비공개로 돌리고 나면 공개 CDN URL은
 * 더 이상 유효한 링크가 아니며, 권한 판정은 요청마다 앱이 한다(C-22).
 *
 * 직접 CDN 모드는 남겨 둔다 — 버킷을 아직 비공개로 바꾸지 않은 환경에서
 * 배포 순서 때문에 화면이 깨지지 않게 하는 탈출구다. 켜려면 명시해야 한다.
 *
 * (역사) CDN 미설정 시 `assetUrl`은 "/assets-unavailable/<key>"를 돌려줬다 —
 * URL 자리에 진단 문자열을 넣은 것이라, `{#if url}` 가드가 통과해 버리고
 * 브라우저가 깨진 이미지를 그렸다(W-8 / K-2). 빈 문자열이어야 가드가 선다.
 */

afterEach(() => {
  delete testEnv.ASSETS_CDN_URL;
  delete testEnv.ASSETS_ACCESS;
});

describe("assetUrl", () => {
  it("기본값은 권한을 확인하는 앱 경로다", () => {
    testEnv.ASSETS_CDN_URL = "https://cdn.example/assets/";

    expect(assetUrl("gallery/a.jpg")).toBe("/media/gallery/a.jpg");
  });

  it("CDN이 없어도 앱 경로는 그대로 동작한다", () => {
    expect(assetUrl("gallery/a.jpg")).toBe("/media/gallery/a.jpg");
  });

  it("빈 키는 빈 문자열이다 — 가드가 서야 한다", () => {
    expect(assetUrl("")).toBe("");
  });

  describe("ASSETS_ACCESS=public — 버킷이 아직 공개인 환경의 탈출구", () => {
    it("설정된 CDN URL을 그대로 쓴다", () => {
      testEnv.ASSETS_ACCESS = "public";
      testEnv.ASSETS_CDN_URL = "https://cdn.example/assets/";

      expect(assetUrl("gallery/a.jpg")).toBe(
        "https://cdn.example/assets/gallery/a.jpg",
      );
    });

    it("CDN이 없으면 빈 문자열이다", () => {
      testEnv.ASSETS_ACCESS = "public";

      expect(assetUrl("gallery/a.jpg")).toBe("");
    });
  });
});
