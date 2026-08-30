import { dev } from "$app/environment";
import { error, redirect, type Cookies } from "@sveltejs/kit";
import { ensureSession } from "$lib/server/auth-guards";
import { getDevAccountSettings } from "$lib/server/dev-member-fixtures";
import {
  resolveDevPreviewRole,
  type DevPreviewRole,
} from "$lib/server/dev-preview";

export async function requireDevAccount(
  locals: App.Locals,
  url: URL,
  cookies: Cookies,
  options: { allowWithdrawn?: boolean } = {},
) {
  await ensureSession(locals, url);
  if (!dev) throw error(503, "새 회원 계정 API 연결이 필요합니다.");

  const role = resolveDevPreviewRole(url, cookies) as DevPreviewRole | null;
  if (!role) throw error(404, "Not Found");
  const account = getDevAccountSettings(role);
  if (!account) throw error(404, "회원 정보를 찾을 수 없습니다.");

  if (account.status === "withdrawn" && !options.allowWithdrawn) {
    throw redirect(303, "/withdraw/pending");
  }
  return { role, account };
}
