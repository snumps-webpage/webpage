import { fail } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import {
  previewBroadcast,
  saveDraft,
  sendBroadcast,
  sendBroadcastTest,
} from "$lib/server/mail/broadcast/send";
import { recentBroadcasts } from "$lib/server/mail/broadcast/store";
import type { PageServerLoad } from "./$types";

/** 전체 발송은 400명 묶음을 순차 발송하므로 기본 한도보다 길게 둔다. */
export const config: Config = { maxDuration: 120 };

/** 전체 메일 발송 화면: 최근 발송 기록 20건. */
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  return { recent: await recentBroadcasts(20) };
};

// 폼에서는 s3Key만 읽는다. 제목·HTML은 서버가 staging 파일에서 다시 만든다.
// 문제 코드의 한국어 문구는 화면이 매핑하고 서버는 코드만 돌려준다.
// 파일이 실려 오면 문자열이 아니다 — 빈 키로 보내 서비스가 bad-key로 거절한다.
const s3KeyOf = (data: FormData) => {
  const v = data.get("s3Key");
  return typeof v === "string" ? v.trim() : "";
};

// 쉼표로 구분한 정수 목록. 빈 문자열은 빈 배열, 형식이 틀리면 null.
// 범위·중복 검사는 서비스가 한다.
const parseRemoved = (v: FormDataEntryValue | null): number[] | null => {
  if (typeof v !== "string") return null;
  if (v === "") return [];
  const parts = v.split(",").map((p) => p.trim());
  return parts.every((p) => /^\d+$/.test(p)) ? parts.map(Number) : null;
};

type ActionArgs = { request: Request; locals: App.Locals };

export const actions = {
  preview: async ({ request, locals }: ActionArgs) => {
    const s3Key = s3KeyOf(await request.formData());
    return handleAdminAction(locals, async () => {
      const r = await previewBroadcast(s3Key);
      if (!r.ok) return fail(400, { error: r.problem });
      return { operation: "preview", preview: r.preview };
    });
  },

  saveDraft: async ({ request, locals }: ActionArgs) => {
    const data = await request.formData();
    const s3Key = s3KeyOf(data);
    const subject = data.get("subject");
    const html = data.get("html");
    const removed = parseRemoved(data.get("removed"));
    return handleAdminAction(locals, async (session) => {
      if (typeof subject !== "string" || typeof html !== "string" || !removed) {
        return fail(400, { error: "bad-input" });
      }
      const r = await saveDraft(
        s3Key,
        { subject, html, removedAttachments: removed },
        session.user.email,
      );
      if (!r.ok) return fail(400, { error: r.problem });
      return { operation: "draft-saved", savedAt: r.savedAt };
    });
  },

  // 시험 수신자는 세션 관리자 본인뿐.
  test: async ({ request, locals }: ActionArgs) => {
    const s3Key = s3KeyOf(await request.formData());
    return handleAdminAction(locals, async (session) => {
      const r = await sendBroadcastTest(s3Key, session.user.email);
      if (!r.ok) return fail(400, { error: r.problem });
      return { operation: "test-sent" };
    });
  },

  send: async ({ request, locals }: ActionArgs) => {
    const s3Key = s3KeyOf(await request.formData());
    return handleAdminAction(locals, async (session) => {
      const r = await sendBroadcast(s3Key, session.user.email);
      if (!r.ok) {
        return r.problem === "duplicate"
          ? fail(409, { error: "duplicate", existing: r.existing })
          : fail(400, { error: r.problem });
      }
      return { operation: "sent", row: r.row, skipped: r.skipped };
    });
  },
};
