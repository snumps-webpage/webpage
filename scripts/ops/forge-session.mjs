// 로컬 dev 서버용 세션 쿠키 위조(테스트 전용) — AUTH_SECRET 필요.
// usage: node scripts/ops/forge-session.mjs <email> "<name>"
import { encode } from "@auth/core/jwt";

const email = process.argv[2];
const name = process.argv[3] ?? "테스트 사용자";
const secret = process.env.AUTH_SECRET;
if (!email || !secret) {
  console.error("usage: AUTH_SECRET=... node forge-session.mjs <email> <name>");
  process.exit(1);
}
const token = await encode({
  token: { name, email, sub: "test-user-id" },
  secret,
  salt: "authjs.session-token",
  maxAge: 3600,
});
process.stdout.write(token);
