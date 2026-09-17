# 배포 가능성 점검 — `chore/code-audit-v2` 대 배포 중이던 `main`

> 기준일: 2026-09-17 · `main` `76a5cda` 대비 **70커밋**
> 방법: 두 브랜치를 **같은 조건으로 빌드해 Vercel 라우팅 표를 기계적으로 비교**하고,
> 그 위에 **운영 데이터를 붙인 서버로 전 라우트·전 화면을 실측**했다.
> 앞선 판(2026-09-10)은 26커밋 시점에서 멈춰 있었다 — 그 뒤 43커밋을 보지 못한
> 판정이었으므로 이 문서가 대체한다.

## 결론

**배포 가능.** URL 손실은 의도된 실험 라우트 5개뿐이고, 기능 손실은 없다.
게이트 전부 통과, 운영 데이터 실측에서 오류 0.

남은 것은 **코드가 아니라 절차**다 — 배포 순서(§4)와 롤백 수단(§5)이 그것이다.

---

## 1. 게이트 (HEAD에서 실측)

| 검사                                 | 결과                                 |
| ------------------------------------ | ------------------------------------ |
| `vitest run`                         | **535 passed · 2 skipped**           |
| `svelte-check`                       | **0 errors · 0 warnings** (935 파일) |
| `eslint .`                           | **0**                                |
| `vite build`                         | 통과                                 |
| 라우트 스모크 (`ops-smoke-all.mjs`)  | **66/66**                            |
| 화면 렌더링 (`ops-render-check.mjs`) | **20/20**                            |

뒤의 두 가지는 이번에 새로 만든 실측 게이트다. 상태 코드만 보는 검사로는
잡히지 않는 결함을 실제로 하나 잡았다 — 공개 세미나 상세가 자정을 진짜 시각처럼
"오전 12:00"으로 표시하던 것(커밋 `2da6fc6`).

## 2. URL 표면 — 기계적 비교

두 브랜치를 `DATA_BACKEND=memory`로 빌드해 `.vercel/output/config.json`을 비교했다.

|                            | `main` | HEAD |
| -------------------------- | ------ | ---- |
| 라우트 패턴                | 75     | 62   |
| `overrides`(정적화된 HTML) | 9      | 0    |

**사라지는 URL — 5개, 전부 의도된 것**

`/experiment/1` · `/experiment/2` · `/experiment/3` · `/experiment/4` · `/experiment/index`
— 죽은 실험 라우트 제거(`292770a`).

**새로 생기는 URL — 1개**

`/media/<key>` — 비공개 `assets` 버킷의 유일한 읽기 통로(C-22, API-SPEC §7-5).

**정적 → 함수로 바뀐 페이지 — 9개 (URL은 그대로)**

`/about` · `/about/charter` · `/about/elections` · `/about/finance` · `/about/press` ·
`/archive/discussions` · `/archive/misc` · `/archive/misc/integration-bee` · `/archive/problems`

회원 스냅샷이 정적 HTML에 구워지는 것을 막으려는 의도된 변경(`d0dbbdd`)이다.
**부수효과**: 빌드가 더 이상 페이지를 크롤하지 않으므로, 데이터 계층 오설정이
빌드에서 실패하지 않고 런타임에 드러난다. 함수 호출량도 소폭 늘어난다(Hobby).

## 3. 운영 환경 (Vercel · 실측)

`vercel env ls production`으로 확인했다.

| 변수                                                         | 상태     | 판단                                               |
| ------------------------------------------------------------ | -------- | -------------------------------------------------- |
| `SUPABASE_URL`·`SUPABASE_SECRET_KEY`·`DATA_BACKEND`·버킷 3종 | 등록됨   | ✅                                                 |
| `AUTH_SECRET`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`      | 등록됨   | ✅ 로그인 동작                                     |
| `ADMINS_EMAILS`·`ADMIN_REFRESH_TOKEN`                        | 등록됨   | ✅ 세미나 메일 3종이 실제로 발송된다               |
| `CRON_SECRET`                                                | 등록됨   | ✅                                                 |
| `ASSETS_ACCESS`                                              | **없음** | ✅ **없는 것이 정답** — 새 기본값(`/media` 프록시) |
| `SITE_ORIGIN`                                                | 없음     | 무해 — 폴백이 `https://snumps.vercel.app`으로 동일 |
| `REDIS_URL`                                                  | 없음     | 메모리 캐시만. 정상 동작                           |
| `HEALTHCHECKS_PING_URL`·`GITHUB_BACKUP_TOKEN`                | 없음     | 백업 스케줄러(§6) — 이번 배포 범위 밖              |

> Preview 환경에는 `SUPABASE_*`가 없다. 그래서 **프리뷰 배포로는 실환경 검증이 되지
> 않는다**(503). 대신 운영 DB를 붙인 로컬 서버로 전 라우트를 실측했다.

## 4. 배포 순서 — 뒤집으면 안 되는 것

1. **배포**
2. **그 다음** `assets` 버킷 비공개 전환 (`ops-assets-private.mjs --apply`)

순서를 뒤집으면 배포 전 코드가 공개 CDN URL을 쓰고 있으므로 **사이트의 모든
이미지·PDF가 한꺼번에 깨진다.** 반대 순서는 안전하다 — Supabase는 공개 버킷에도
서명 URL을 발급하므로 `/media`는 어느 쪽이든 동작한다.

3. 복구 스크립트 재실행 + 감사 (`ops-repair-seminar-schedules.mjs` ·
   `ops-notion-backfill-seminars.mjs` · `ops-migration-audit.mjs --skip-notion`)

## 5. 롤백 — `git revert`가 아니다

배포 전 `main`의 `SeminarSchema`에는 `publicationStatus`·`schedule`·`announcedAt`·
`semesterPinned`·`description`이 **하나도 없다**. zod는 모르는 키를 읽는 순간 벗기고,
`mutateObject`는 표 문서 **전체**를 다시 쓴다 — 되돌린 코드가 한 번 쓰면 모든 행에서
그 필드들이 사라진다. 특히 `announcedAt`이 지워지면 재공개 시 **전 회원에게 공지가
다시 나간다**.

**롤백 = 데이터 복원.** 스냅샷은 `ops-backup-db.mjs`로 받는다(`app_tables` ·
`app_queues` · `audit_log`, 약 460KB). 배포 직전 사본을 받아 두었다.

## 6. 이번 배포 범위 밖 — 백업 스케줄러

`backups/dumps/`가 비어 있다. 주간 백업(B1)이 **한 번도 만들어진 적이 없다.**
원인은 코드가 아니라 미설정이다 — `OPERATOR-TODO` 상태표 4번(cron-job.org 잡 3개)이
미완이고, 그 침묵을 알렸어야 할 5번(Healthchecks)도 미완이며, 설령 돌았어도
6번(백업 repo PAT)이 없어 오프플랫폼 사본은 실패했을 것이다. 가동(2026-08-30) 이후
KST 일요일 3회가 모두 비어 있는 것이 이것으로 설명된다.

배포 후 4·5·6을 마쳐야 다음에도 롤백 수단이 생긴다.

## 7. 배포 직전에 고친 것

배포 검증(에이전트 3인 + 자체 재현) 중 발견해 고친 결함들이다. 전부 재현 후 수정했다.

- 신청 흐름으로 공개된 세미나의 **포스터가 게스트에게 404** — 승인이 `posterKey`를
  물려받아 신청 행과 키를 공유하는데, "가장 엄격한 소유자"가 공개된 세미나를
  관리자 전용으로 끌어내렸다. 보통 경로였다.
- 관리자 심사 화면의 포스터 썸네일이 **항상 깨짐** — Vercel 이미지 최적화가 원본을
  쿠키 없이 가져가 404를 받는다.
- 일정 수정이 **방학 학기 라벨을 파괴** (`25-W` → `26-2`) — `termOf`는 정규 학기만
  만든다. 운영 DB에 해당 8건.
- 일정 다이얼로그가 "시각 미정"을 `00:00`으로 굳힘 → `시각 미정` 체크박스 추가.
- 공개 목록이 **항상 "장소 기록 없음"**, 정렬 비교자가 비전이적.
- 메일이 시각 미정 일정을 **자정으로 인쇄** → 날짜만 싣는다.
- 발송 실패 안내가 **실행 불가능한 방법**을 지시 → `공지 재발송` 버튼을 만들었다.
