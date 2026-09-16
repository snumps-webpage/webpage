import { describe, expect, it } from "vitest";
import { parseDotenv } from "../../../../scripts/ops/lib-env.mjs";

/**
 * 운영 스크립트가 `.env`를 읽는 규칙.
 *
 * 실측한 결함: 줄 끝 주석을 값의 일부로 읽었다. 노션 DB id 뒤에 `# 세미나 기록 DB`가
 * 붙어 요청 URL이 깨졌고, 노션은 400 `invalid_request_url`로 답했다. 같은 최소
 * 구현을 스크립트마다 복사해 뒀던 탓에 **같은 버그가 세 벌** 있었다.
 */
describe("parseDotenv", () => {
  it("KEY=VALUE를 읽는다", () => {
    expect(parseDotenv("FOO=bar")).toEqual({ FOO: "bar" });
  });

  // 이것이 노션 요청을 깨뜨린 그 줄이다.
  it("줄 끝 주석은 값이 아니다", () => {
    expect(parseDotenv("NOTION_DB=3042abcd   # 세미나 기록 DB")).toEqual({
      NOTION_DB: "3042abcd",
    });
  });

  it("값 안의 #는 자르지 않는다", () => {
    expect(parseDotenv("COLOR=#ff0000")).toEqual({ COLOR: "#ff0000" });
  });

  it("따옴표는 벗기고 그 뒤 주석은 버린다", () => {
    expect(parseDotenv('KEY="a b c"  # 설명')).toEqual({ KEY: "a b c" });
    expect(parseDotenv("KEY='a#b'")).toEqual({ KEY: "a#b" });
  });

  it("전체 주석과 빈 줄은 건너뛴다", () => {
    expect(parseDotenv("# 주석\n\nFOO=1\n")).toEqual({ FOO: "1" });
  });

  it("export 접두를 허용한다", () => {
    expect(parseDotenv("export FOO=bar")).toEqual({ FOO: "bar" });
  });

  it("= 가 없는 줄은 무시한다", () => {
    expect(parseDotenv("그냥 문장\nFOO=1")).toEqual({ FOO: "1" });
  });

  it("값에 = 가 있어도 첫 = 에서만 자른다", () => {
    expect(parseDotenv("URL=postgres://u:p@h/db?x=1")).toEqual({
      URL: "postgres://u:p@h/db?x=1",
    });
  });
});
