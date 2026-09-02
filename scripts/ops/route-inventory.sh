#!/usr/bin/env bash
# 비그룹(프론트) 라우트 파일과 그룹(백엔드) 대응 파일 대조 인벤토리
set -euo pipefail
cd "$(dirname "$0")/../.."
for f in $(find src/routes/about src/routes/admin src/routes/archive src/routes/events src/routes/login src/routes/members src/routes/settings src/routes/study src/routes/withdraw -type f | sort); do
  rel="${f#src/routes/}"
  case "$rel" in
    about/*|archive/*|members/*|login/*) g="src/routes/(public)/$rel" ;;
    admin/*) g="src/routes/(admin)/$rel" ;;
    events/*|settings/*|study/*|withdraw/*) g="src/routes/(member)/$rel" ;;
  esac
  if [ -f "$g" ]; then echo "BOTH        $rel"; else echo "ONLY-FRONT  $rel"; fi
done
