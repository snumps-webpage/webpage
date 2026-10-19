import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BroadcastParseError, parseEml, stripForwardPrefix } from "./parse";

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(
      join(process.cwd(), "src/lib/server/mail/broadcast/fixtures", name),
    ),
  );

/** 시험용 단일 파트 합성 메일(html만, text만, 또는 둘 다). */
function rawMail(parts: { html?: string; text?: string }): Uint8Array {
  const b = "tb";
  const part = (type: string, body: string) =>
    `--${b}\r\nContent-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body).toString("base64")}\r\n`;
  const raw =
    "Subject: S\r\nMessage-ID: <t@example.com>\r\nMIME-Version: 1.0\r\n" +
    `Content-Type: multipart/alternative; boundary="${b}"\r\n\r\n` +
    (parts.text !== undefined ? part("text/plain", parts.text) : "") +
    (parts.html !== undefined ? part("text/html", parts.html) : "") +
    `--${b}--\r\n`;
  return new TextEncoder().encode(raw);
}

describe("parseEml", () => {
  it("strips the Gmail forward header and the forwarder's note", async () => {
    const mail = await parseEml(fixture("gmail-forward.eml"));
    expect(mail.messageId).toBe("fwd-1@example.com");
    expect(mail.subject).toBe("[학과] 안내");
    expect(mail.html).not.toContain("Forwarded message");
    expect(mail.html).not.toContain("전달자 메모");
    expect(mail.html).toContain("원본 본문 줄입니다.");
    expect(mail.text).not.toContain("Forwarded message");
    expect(mail.text).not.toContain("전달자 메모");
    expect(mail.text).not.toContain("From: Office");
    expect(mail.text).toContain("원본 본문 줄입니다.");
  });

  it("keeps an inline image with its content id", async () => {
    const mail = await parseEml(fixture("cid-image.eml"));
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].disposition).toBe("inline");
    expect(mail.attachments[0].contentId).toBe("img1@x");
  });

  it("keeps an attachment's name and bytes", async () => {
    const mail = await parseEml(fixture("attachment.eml"));
    expect(mail.attachments).toHaveLength(1);
    const [a] = mail.attachments;
    expect(a.disposition).toBe("attachment");
    expect(a.filename).toBe("a.pdf");
    expect(a.content.byteLength).toBe(
      Buffer.from("JVBERi0xLjQK", "base64").length,
    );
  });

  it("falls back to a sha256 of the file when Message-ID is missing", async () => {
    const mail = await parseEml(fixture("no-message-id.eml"));
    expect(mail.messageId).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects a broken file as no-body", async () => {
    const err = await parseEml(fixture("broken.eml")).catch((e) => e);
    expect(err).toBeInstanceOf(BroadcastParseError);
    expect(err.code).toBe("no-body");
  });

  it("strips a localized (Korean) Gmail forward header", async () => {
    const mail = await parseEml(fixture("gmail-forward-ko.eml"));
    expect(mail.subject).toBe("[학과] 공지");
    for (const body of [mail.html, mail.text]) {
      expect(body).not.toContain("전달된 메시지");
      expect(body).not.toContain("보낸사람");
      expect(body).not.toContain("전달 메모");
      expect(body).toContain("한국어 원본 본문입니다.");
    }
  });

  it("recognizes gmail_quote combined with other classes (single quotes too)", async () => {
    const html =
      "<p>memo</p><div class='gmail_quote gmail_quote_container'><div class='gmail_attr'>---------- Forwarded message ---------<br>From: A &lt;a@example.com&gt;<br>Subject: s<br></div><p>quoted</p></div>";
    const mail = await parseEml(rawMail({ html }));
    expect(mail.html).not.toContain("memo");
    expect(mail.html).not.toContain("Forwarded message");
    expect(mail.html).toContain("quoted");
  });

  it("keeps an ordinary reply thread untouched (html and text)", async () => {
    const html =
      '<p>new text</p><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Fri, Oct 16, 2026 at 10:00 AM A &lt;a@example.com&gt; wrote:<br></div><blockquote>old</blockquote></div>';
    const text =
      "new text\n\nOn Fri, Oct 16, 2026 at 10:00 AM A <a@example.com> wrote:\n> old\n";
    const mail = await parseEml(rawMail({ html, text }));
    expect(mail.html).toBe(html);
    expect(mail.text?.trim()).toBe(text.trim());
    expect(mail.html).toContain("new text");
  });

  it("leaves a mail without a forward header unchanged", async () => {
    const mail = await parseEml(fixture("no-message-id.eml"));
    expect(mail.text?.trim()).toBe("Body without a Message-ID.");
  });

  it("handles a very long dash line in linear time", async () => {
    const text = `intro\n\n${"-".repeat(50000)}x\n\nbody`;
    const started = Date.now();
    const mail = await parseEml(rawMail({ text }));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(mail.text).toContain("intro");
  });

  it("does not mistake a body separator for a forward header", async () => {
    const text =
      "공지 본문 첫 단락입니다.\n\n----- 일정 -----\n보낸 사람: 학과 사무실에서 안내드립니다.";
    const mail = await parseEml(rawMail({ text }));
    expect(mail.text?.trim()).toBe(text);
  });

  it("keeps body lines that only look like headers when no blank line follows", async () => {
    const text =
      "---------- Forwarded message ---------\nFrom: A <a@example.com>\nSubject: s\n공지: 내일 휴강";
    const mail = await parseEml(rawMail({ text }));
    expect(mail.text).toBe("공지: 내일 휴강");
  });

  it("keeps the body when the forward header has no blank line after it", async () => {
    const text =
      "note\n---------- Forwarded message ---------\nFrom: A <a@example.com>\nSubject: s\nbody line";
    const mail = await parseEml(rawMail({ text }));
    expect(mail.text).toBe("body line");
  });

  it("rejects an empty subject", async () => {
    const raw = new TextEncoder().encode(
      "Subject: Fwd: \r\nContent-Type: text/plain\r\n\r\nbody\r\n",
    );
    await expect(parseEml(raw)).rejects.toMatchObject({ code: "no-subject" });
  });
});

describe("stripForwardPrefix", () => {
  it("removes repeated prefixes", () => {
    expect(stripForwardPrefix("Fwd: FW: 전달: x")).toBe("x");
    expect(stripForwardPrefix("fwd: Fw: y ")).toBe("y");
    expect(stripForwardPrefix("plain")).toBe("plain");
  });
});
