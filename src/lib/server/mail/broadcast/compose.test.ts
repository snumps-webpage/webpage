import { describe, expect, it } from "vitest";
import { composeBroadcast } from "./compose";
import { parseEml, type MailAttachment } from "./parse";

const enc = (s: string) => new TextEncoder().encode(s);

const inlineImg: MailAttachment = {
  filename: "i.png",
  mimeType: "image/png",
  disposition: "inline",
  contentId: "img1@x",
  content: enc("PNGDATA"),
};
const pdf: MailAttachment = {
  filename: "a.pdf",
  mimeType: "application/pdf",
  disposition: "attachment",
  contentId: null,
  content: enc("PDFDATA"),
};

const mail = {
  subject: "공지 제목",
  html: '<p>hi</p><img src="cid:img1@x">',
  text: "hi",
  attachments: [inlineImg, pdf],
};

describe("composeBroadcast", () => {
  it("Bcc만 두고 To·From·Reply-To는 두지 않음(D-000143, D-000123)", async () => {
    const raw = (await composeBroadcast(mail, ["a@x.com", "b@x.com"])).toString(
      "utf8",
    );
    const head = raw.split(/\r?\n\r?\n/)[0];
    expect(head).toMatch(/^Bcc:.*a@x\.com/im);
    expect(head).toContain("b@x.com");
    expect(head).not.toMatch(/^To:/im);
    expect(head).not.toMatch(/^From:/im);
    expect(head).not.toMatch(/^Reply-To:/im);
  });

  // nodemailer 실제 구조: mixed > alternative > (text, related(html, 내장 이미지)), 첨부
  it("mixed > alternative > related 구조와 cid·filename 유지", async () => {
    const raw = (await composeBroadcast(mail, ["a@x.com"])).toString("utf8");
    const mixed = raw.indexOf("Content-Type: multipart/mixed");
    const alt = raw.indexOf("Content-Type: multipart/alternative");
    const related = raw.indexOf("Content-Type: multipart/related");
    expect(mixed).toBeGreaterThanOrEqual(0);
    expect(alt).toBeGreaterThan(mixed);
    expect(related).toBeGreaterThan(alt);
    expect(raw).toContain("Content-ID: <img1@x>");
    // nodemailer는 안전한 파일명의 따옴표를 생략함
    expect(raw).toMatch(/filename="?a\.pdf"?/);
  });

  it("disposition이 null인 cid 이미지는 inline으로 조립됨(D-000162)", async () => {
    const raw = (
      await composeBroadcast(
        {
          ...mail,
          attachments: [{ ...inlineImg, disposition: null }],
        },
        ["a@x.com"],
      )
    ).toString("utf8");
    expect(raw).toContain("Content-Disposition: inline");
    expect(raw).not.toContain("Content-Disposition: attachment");
  });

  it("cid 없는 일반 첨부(disposition null)는 attachment로 남음", async () => {
    const raw = (
      await composeBroadcast(
        { ...mail, attachments: [{ ...pdf, disposition: null }] },
        ["a@x.com"],
      )
    ).toString("utf8");
    expect(raw).toContain("Content-Disposition: attachment");
  });

  it("parseEml로 되읽으면 제목·첨부 수가 유지됨", async () => {
    const raw = await composeBroadcast(mail, ["a@x.com"]);
    const parsed = await parseEml(new Uint8Array(raw));
    expect(parsed.subject).toBe("공지 제목");
    expect(parsed.attachments).toHaveLength(2);
  });

  it("Bcc 400개(dispatch BATCH_SIZE)가 접힌 줄을 이어 붙여도 순서·값이 그대로이고 To·From·Reply-To 줄이 없음", async () => {
    const bcc = Array.from({ length: 400 }, (_, i) => `m${i}@example.com`);
    const raw = (await composeBroadcast(mail, bcc)).toString("utf8");
    const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
    const line = head.split(/\r?\n/).find((l) => /^Bcc:/i.test(l));
    expect(line).toBeDefined();
    const values = line!
      .replace(/^Bcc:\s*/i, "")
      .split(",")
      .map((v) => v.trim());
    expect(values).toEqual(bcc);
    expect(head).not.toMatch(/^To:/im);
    expect(head).not.toMatch(/^From:/im);
    expect(head).not.toMatch(/^Reply-To:/im);
  });

  it("한글 본문·파일명, cid·disposition, 첨부 바이트가 왕복 후 보존됨", async () => {
    const bytes = new Uint8Array([
      0x00, 0xff, 0x80, 0x0a, 0x0d, 0x41, 0x0d, 0x0a,
    ]);
    const kor = {
      subject: "안내",
      html: '<p>안녕하세요 회원 여러분</p><img src="cid:img1@x">',
      text: "안녕하세요 회원 여러분",
      attachments: [
        { ...inlineImg, content: bytes },
        {
          filename: "안내문.pdf",
          mimeType: "application/pdf",
          disposition: "attachment" as const,
          contentId: null,
          content: bytes,
        },
      ],
    };
    const parsed = await parseEml(
      new Uint8Array(await composeBroadcast(kor, ["a@x.com"])),
    );
    expect(parsed.html).toContain("안녕하세요 회원 여러분");
    expect(parsed.text).toContain("안녕하세요 회원 여러분");
    const img = parsed.attachments.find((a) => a.contentId === "img1@x");
    const file = parsed.attachments.find((a) => a.filename === "안내문.pdf");
    expect(img?.disposition).toBe("inline");
    expect(file?.disposition).toBe("attachment");
    expect(Array.from(img!.content)).toEqual(Array.from(bytes));
    expect(Array.from(file!.content)).toEqual(Array.from(bytes));
  });

  it("80자 이상 한글 제목이 접혀도 되읽으면 원문과 같음", async () => {
    const subject = "전체 회원 안내 ".repeat(12).trim();
    expect(subject.length).toBeGreaterThanOrEqual(80);
    const parsed = await parseEml(
      new Uint8Array(await composeBroadcast({ ...mail, subject }, ["a@x.com"])),
    );
    expect(parsed.subject).toBe(subject);
  });

  it("bcc가 비면 throw", async () => {
    await expect(composeBroadcast(mail, [])).rejects.toThrow();
  });
});
