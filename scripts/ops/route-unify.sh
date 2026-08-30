#!/usr/bin/env bash
# 라우트 통일: 비그룹(프론트) 트리를 그룹 트리로 흡수
#  - *.svelte  → 프론트 버전이 그룹 경로를 덮어씀 (UI 승)
#  - *.server.ts → 그룹(백엔드) 버전 유지, 프론트 픽스처 버전 폐기 (데이터 승)
#  - 그룹 대응이 없는 파일 → 그룹 경로로 이동
set -euo pipefail
cd "$(dirname "$0")/../.."
for f in $(find src/routes/about src/routes/admin src/routes/archive src/routes/events src/routes/login src/routes/members src/routes/settings src/routes/study src/routes/withdraw -type f | sort); do
  rel="${f#src/routes/}"
  case "$rel" in
    about/*|archive/*|members/*|login/*) g="src/routes/(public)/$rel" ;;
    admin/*) g="src/routes/(admin)/$rel" ;;
    events/*|settings/*|study/*|withdraw/*) g="src/routes/(member)/$rel" ;;
  esac
  base="$(basename "$f")"
  if [ -f "$g" ]; then
    case "$base" in
      *.svelte) mv "$f" "$g"; echo "UI→   $rel" ;;
      *) rm "$f"; echo "drop  $rel (백엔드 서버 파일 유지)" ;;
    esac
  else
    mkdir -p "$(dirname "$g")"
    mv "$f" "$g"
    echo "move  $rel"
  fi
done
# robots.txt / sitemap.xml → (public)
for d in robots.txt sitemap.xml; do
  if [ -d "src/routes/$d" ]; then
    mkdir -p "src/routes/(public)/$d"
    mv "src/routes/$d"/* "src/routes/(public)/$d/"
    rmdir "src/routes/$d"
    echo "move  $d → (public)/$d"
  fi
done
# 빈 비그룹 디렉터리 제거
find src/routes/about src/routes/admin src/routes/archive src/routes/events src/routes/login src/routes/members src/routes/settings src/routes/study src/routes/withdraw -type d -empty -delete 2>/dev/null || true
echo "== leftover ungrouped dirs:"
find src/routes -mindepth 1 -maxdepth 1 -type d | grep -vE "\(|api" || echo "(none)"
