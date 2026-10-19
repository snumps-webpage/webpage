import { describe, expect, it } from "vitest";
import { sanitizeMailHtml, withFooter } from "./sanitize";

describe("sanitizeMailHtml", () => {
  it("script를 내용째 제거한다", () => {
    const out = sanitizeMailHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>hi</p>");
  });

  it("form·input·button·iframe·object·embed·frame·base·meta를 제거한다", () => {
    const html =
      '<meta http-equiv="refresh" content="0"><base href="http://x">' +
      '<form action="/x">SECRETFORM<input name="a">INP<button>BTN</button></form>' +
      '<iframe src="http://x">IFR</iframe><object data="x">OBJ</object><embed src="x"><frame src="x"><p>ok</p>';
    const out = sanitizeMailHtml(html);
    for (const tag of [
      "meta",
      "base",
      "form",
      "input",
      "button",
      "iframe",
      "object",
      "embed",
      "frame",
    ]) {
      expect(out).not.toContain(`<${tag}`);
    }
    for (const inner of ["SECRETFORM", "BTN", "IFR", "OBJ"]) {
      expect(out).not.toContain(inner);
    }
    expect(out).toContain("<p>ok</p>");
  });

  it("on* 속성을 제거한다", () => {
    const out = sanitizeMailHtml('<p onclick="x()" onmouseover="y()">a</p>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
  });

  it("javascript: href를 제거한다", () => {
    const out = sanitizeMailHtml('<a href="javascript:alert(1)">a</a>');
    expect(out).not.toContain("javascript:");
  });

  it("http·https·mailto href는 유지한다", () => {
    const out = sanitizeMailHtml(
      '<a href="https://a.test">a</a><a href="mailto:a@b.test">b</a>',
    );
    expect(out).toContain('href="https://a.test"');
    expect(out).toContain('href="mailto:a@b.test"');
  });

  it("img는 cid·https를 유지하고 data:는 제거한다", () => {
    const out = sanitizeMailHtml(
      '<img src="cid:x" alt="a"><img src="data:image/png;base64,AAAA"><img src="https://a.test/i.png">',
    );
    expect(out).toContain('src="cid:x"');
    expect(out).toContain('src="https://a.test/i.png"');
    expect(out).not.toContain("data:");
  });

  it("인라인 style·표 구조·style 블록을 유지한다", () => {
    const out = sanitizeMailHtml(
      '<style>p{color:blue}</style><table cellpadding="2"><tbody><tr><td style="color:red" colspan="2">a</td></tr></tbody></table>',
    );
    expect(out).toContain('style="color:red"');
    expect(out).toContain("<table");
    expect(out).toContain("<td");
    expect(out).toContain("<style>p{color:blue}</style>");
    expect(out).toContain('colspan="2"');
  });
});

describe("withFooter", () => {
  const url = "https://snumps.test/settings/notifications";

  it("HTML 끝에 hr과 수신 설정 문단을 붙인다", () => {
    const out = withFooter({ html: "<p>본문</p>", text: "본문" }, url);
    expect(out.html).toContain(
      `<hr><p>이 메일은 SNUMPS 전체 공지로 재발송되었습니다. 수신 설정: <a href="${url}">${url}</a></p>`,
    );
    expect(out.html?.endsWith("</p>")).toBe(true);
  });

  it("텍스트 끝에 꼬리말을 붙인다", () => {
    const out = withFooter({ html: "<p>본문</p>", text: "본문" }, url);
    expect(out.text).toBe(
      `본문\n\n-- \n이 메일은 SNUMPS 전체 공지로 재발송되었습니다. 수신 설정: ${url}`,
    );
  });

  it("텍스트가 없으면 HTML에서 태그를 걷어 만든다", () => {
    const out = withFooter(
      { html: "<p>안녕 <b>하세요</b></p><script>x()</script>", text: null },
      url,
    );
    expect(out.text.startsWith("안녕 하세요")).toBe(true);
    expect(out.text).not.toContain("<");
    expect(out.text).not.toContain("x()");
    expect(out.text).toContain(url);
  });

  it("form·button·iframe·object 내부 텍스트는 텍스트 대체본에서도 빠진다", () => {
    const out = withFooter(
      {
        html: "앞<form>SECRETFORM<button>BTN</button></form><iframe>IFR</iframe><object>OBJ</object>뒤",
        text: null,
      },
      url,
    );
    for (const inner of ["SECRETFORM", "BTN", "IFR", "OBJ"]) {
      expect(out.text).not.toContain(inner);
    }
    expect(out.text.startsWith("앞뒤")).toBe(true);
  });

  it("엔티티를 이중 디코딩하지 않는다", () => {
    const a = withFooter({ html: "<p>&amp;lt;b&amp;gt;</p>", text: null }, url);
    expect(a.text.startsWith("&lt;b&gt;")).toBe(true);
    const b = withFooter({ html: "<p>a &amp; b</p>", text: null }, url);
    expect(b.text.startsWith("a & b")).toBe(true);
  });

  it("블록 경계와 br에서 줄이 나뉜다", () => {
    const a = withFooter({ html: "<p>x</p><p>y</p>", text: null }, url);
    expect(a.text.startsWith("x\ny")).toBe(true);
    const b = withFooter({ html: "a<br>b", text: null }, url);
    expect(b.text.startsWith("a\nb")).toBe(true);
  });

  it("HTML이 없으면 html은 null이다", () => {
    const out = withFooter({ html: null, text: "본문" }, url);
    expect(out.html).toBeNull();
    expect(out.text).toContain("본문");
  });
});
