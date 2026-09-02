#!/usr/bin/env bash
# 가입 제출 → 완료 응답 → 재방문 pending 화면 흐름 검증 (dev)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
SCR="/tmp/claude-1000/-home-toxiclemon-Working-webpage/5ee05ade-3617-426c-ae18-1efaafcb5854/scratchpad"
TOKEN="$(node scripts/ops/forge-session.mjs flow-probe@snu.ac.kr "흐름검증 / 학부생 / 수리과학부")"

echo "== 1) 제출"
curl -s -X POST "http://localhost:5199/signup" -H "Cookie: authjs.session-token=$TOKEN" \
  --data-urlencode "phone=010-5555-6666" --data-urlencode "studentId=2025-11111" \
  --data-urlencode "background=흐름검증" --data-urlencode "agreement=on" | head -c 80
echo
echo "== 2) 재방문 /signup"
curl -s -D "$SCR/fh.txt" -o "$SCR/fb.html" "http://localhost:5199/signup" \
  -H "Cookie: authjs.session-token=$TOKEN" -w "%{http_code}\n"
grep -i "^location" "$SCR/fh.txt" || echo "(no redirect)"
grep -oE "이미 접수되었습니다|신청 내용 수정|대기 페이지로 이동" "$SCR/fb.html" | sort -u
echo "== 3) 정리"
node - <<'EOF'
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const { data } = await sb.from("app_tables").select("version, doc").eq("name", "applications").single();
const rows = data.doc.rows.filter((r) => r.email !== "flow-probe@snu.ac.kr");
await sb.from("app_tables").update({ doc: { ...data.doc, rows }, version: data.version + 1 })
  .eq("name", "applications").eq("version", data.version);
console.log("probe row removed");
EOF
