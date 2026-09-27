/**
 * Who may sign in (AUTH-01): an SNU Google Workspace account.
 *
 * The `@snu.ac.kr` suffix alone is not proof — Google's profile also says
 * whether the address is verified and which Workspace domain (`hd`) issued
 * it. All three must agree.
 */
const ALLOWED_DOMAIN = "snu.ac.kr";

export type SignInVerdict = "allow" | "invalid-domain" | "deny";

export function signInVerdict(
  email: string | null | undefined,
  profile: { email_verified?: unknown; hd?: unknown } | undefined,
): SignInVerdict {
  if (!email) return "deny";
  const domainOk = email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
  const verified = profile?.email_verified === true;
  const issuedBySnu =
    typeof profile?.hd === "string" &&
    profile.hd.toLowerCase() === ALLOWED_DOMAIN;
  return domainOk && verified && issuedBySnu ? "allow" : "invalid-domain";
}
