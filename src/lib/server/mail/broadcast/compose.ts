import MailComposer from "nodemailer/lib/mail-composer";
import type { MailAttachment } from "./parse";

/**
 * 해석·정화된 메일을 Gmail `messages.send`용 raw MIME으로 조립함. 수신자는 Bcc에만
 * 넣고 To·From·Reply-To는 두지 않음(D-000143, D-000123). Gmail이 From을 채움.
 */
export async function composeBroadcast(
  mail: {
    subject: string;
    html: string | null;
    text: string;
    attachments: MailAttachment[];
  },
  bcc: string[],
): Promise<Buffer> {
  if (bcc.length === 0) throw new Error("composeBroadcast: bcc is empty");
  const composer = new MailComposer({
    bcc,
    subject: mail.subject,
    html: mail.html ?? undefined,
    text: mail.text,
    attachments: mail.attachments.map((a) => ({
      filename: a.filename ?? undefined,
      contentType: a.mimeType,
      content: Buffer.from(a.content),
      cid: a.contentId ?? undefined,
      // 헤더 없는 cid 이미지는 nodemailer가 inline으로 고르게 비워 둠(D-000162)
      contentDisposition: a.disposition ?? undefined,
    })),
  });
  const compiled = composer.compile();
  // raw 메시지에는 Bcc 헤더가 있어야 Gmail이 수신자로 읽음
  compiled.keepBcc = true;
  return compiled.build();
}
