# 우선 처리 목록

> **성격**: 한시적 작업 문서. [README](./README.md) 참조.
> 근거는 [REGISTER.md](./REGISTER.md)와 `files/` 아래 파일별 문서에 있다 — 여기서는
> **무엇을 어떤 순서로, 왜 그 순서로** 하는지만 적는다.
>
> 기준일: 2026-09-10. 브랜치 `chore/code-audit-v2`.

## 지금 상태

|           |                                                                                            |
| --------- | ------------------------------------------------------------------------------------------ |
| 감사 진행 | 위험 선행 11개 완료 (지적 66건). 계층 감사(A-a~A-d, 98파일) 미착수                         |
| 처리 완료 | 🔴 6건 중 6건 (5건 수정, ZR-7은 C-17 결정으로 해소)                                        |
| 검증 상태 | `vitest` 270 passed · `svelte-check` 0 errors · `vite build` 통과 · **`eslint` 14 errors** |
| 미결 결정 | C-12 ~ C-15                                                                                |

---

## P0 — CI가 빨간불이다

**이것을 먼저 하지 않으면 이후 모든 작업의 신호가 죽는다.**
`.github/workflows/ci.yml`의 Lint 단계가 `eslint .`이고, `main`에서 exit 1이다(`XC-1`).
PR마다 빨간불이면 그 빨간불이 새 결함을 뜻하는지 아무도 구별하지 못한다.

### P0-1 `no-irregular-whitespace` 8건 — 규칙이 코드에 맞지 않는다

| 파일                                     | 위치       |
| ---------------------------------------- | ---------- |
| `src/lib/server/core/strings.ts`         | 8:26, 8:29 |
| `scripts/ops/ops-clean-applications.mjs` | 5:35, 5:38 |
| `scripts/ops/ops-strip-probe-check.mjs`  | 6:22, 6:25 |
| `scripts/ops/ops-verify-clean-names.mjs` | 6:22, 6:25 |

전부 **비가시 문자 제거 로직 안의 의도된 리터럴**이다 — U+200B 류를 문자 클래스에 직접 적는다.
코드가 틀린 게 아니라 규칙이 이 파일에 맞지 않는다.
**처방**: `\u200B` 이스케이프로 바꾼다. 동작은 동일하고 의도가 더 분명해진다.
(라인 단위 `eslint-disable`은 차선 — 다음에 진짜 오염이 들어와도 못 잡는다.)

### P0-2 실제 지적 6건

| 파일                                                  | 규칙                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `src/routes/(admin)/admin/executives/+page.svelte:15` | `svelte/prefer-writable-derived`                        |
| `src/routes/(admin)/admin/executives/+page.svelte:48` | `svelte/prefer-svelte-reactivity` (`Map` → `SvelteMap`) |
| `src/routes/(admin)/admin/executives/+page.svelte:89` | `svelte/no-useless-mustaches`                           |
| `src/lib/components/public/PublicIndexList.svelte:44` | `svelte/require-each-key`                               |
| `src/lib/server/data/storage-memory.ts:118`           | 미사용 `_max`                                           |
| `scripts/migration/20-export-tables.ts:59`            | `TABLE_NAMES`가 타입으로만 쓰임                         |

`svelte/require-each-key`는 성능·정확성 양쪽에 영향이 있으므로 자동 수정에 맡기지 말고 키를 고른다.

### P0-3 CI가 검사하지 않는 것을 넣을지 결정 (`XC-2`)

`package.json`에 검사 스크립트가 넷인데 CI는 하나 반만 돈다.

| 스크립트                              | CI          |
| ------------------------------------- | ----------- |
| `test` (`vitest run`)                 | ✅          |
| `lint` (`prettier --check && eslint`) | ⚠️ eslint만 |
| `check` (`svelte-check`)              | ❌          |
| `build`                               | ❌          |

**`check`가 없는 것이 가장 위험하다** — 이전 감사의 `X-1`(빌드 불가)을 실제로 잡고 있던
유일한 도구가 `svelte-check`였는데 그때도 CI에 없었고 지금도 없다.
`build`는 C-17 이후 크레덴셜 없이도 통과하므로 CI에 넣을 수 있게 됐다.
`prettier`는 추적 파일 131개가 실패 중이라 별도 결정이 필요하다 — 한 번 `--write`로 정리하고
CI에 넣거나, `lint` 스크립트에서 빼서 스크립트와 CI를 일치시키거나.

---

## P1 — 노출 표면을 줄이는 삭제 (싸고 효과가 크다)

### P1-1 죽은 큐 페이로드 키 3개 — **신청자 PII가 계속 전송된다** (`QA-5` `QS-5` `QD-3`)

```
api/admin/applications/+server.ts:19      applications:   sorted.map(applicationView)
api/admin/seminar-requests/+server.ts:20  seminarRequests: pending.map(seminarRequestView)
api/admin/study-requests/+server.ts:20    studyRequests:   pending.map(studyRequestView)
```

세 키 모두 `queueResponseEnvelopeSchema`(`domain/api.ts:26-30`)가 파싱 단계에서 버린다.
소비자는 `.items`만 읽는다. `API-SPEC` §8-3은 **응답 형태를 정의하지 않으므로 계약도 아니다.**

`applications:`가 버리는 것은 **신청자 PII 전체** — `email` · `phone` · `studentId` ·
`background`(`views.ts:41-52`). 30초 폴링 × 폴러 2개로 계속 직렬화되어 전송된다.

**한 줄씩 세 곳 삭제.** 가장 값싼 실질 개선이다.

### P1-2 `(admin)/+layout.server.ts` 삭제 (`ZA-3`)

그룹 안에 소비자가 없다(`await parent()` 0건, `+layout.svelte` 없음). 관측 가능한 유일한 효과가
루트가 계산한 `isMember`를 리터럴로 덮는 것이다. 삭제하면 **세 지적이 동시에 닫힌다** —
`ZA-3`, `ZA-1`의 잔여분(C-18 결정 후 남은 절반), `ZA-4`(세션 3회 해석 중 하나).

---

## P2 — 사용자에게 보이는 정확성 결함

### P2-1 재가입 신청자가 자기 대기 페이지에 못 들어간다 (`ZP-4`) 🟠

가드는 미등록 회원을 **일부러** 신청자 존에 들여보내는데(`zone.ts:119-121`),
신청 제출 후 `/wait`에서 `isMember`가 true라 `/`로 튕긴다(`wait/+page.server.ts:10`).
**대기 중인 자기 신청서를 영영 볼 수 없다.**

원인은 `isMember`의 정의가 존마다 다른 것(`ZP-3`)이므로, 고치려면 그 필드의 의미를 먼저 정해야
한다. P1-2(`(admin)` 레이아웃 삭제)가 생산자 하나를 줄이므로 **그 뒤에 하는 것이 낫다.**

### P2-2 방학 학기 사진이 1970년으로 정렬된다 (`ZR-4`) 🟠

`SEMESTER_PATTERN`은 `YY-S`/`YY-W`를 허용하는데(`core/semester.ts:17`) `termRange`는
`TERM_PATTERN`으로 던진다(`:38-40`). 활동 날짜가 없는 방학 학기 사진은 전부
`catch { return "1970-01-01" }`에 떨어진다. **정상 데이터에서 발동하는 논리 오류**이고,
스키마 주석이 그 방학 학기가 클럽 사료에 실재한다고 적는다.

---

## P3 — 검증 끝난 단일 소스 통합

두 건 모두 두 에이전트의 반증 시도를 통과했다. 나머지 A 항목은 통합 대상이 **아니다**(REGISTER A 참조).

### P3-1 크론 Bearer 헬퍼 (`CS-1` `CM-1` `HL-1`)

세 엔드포인트에 주석까지 바이트 동일. `requireCronAuth(request): Response | null` 하나.
**주의할 것:**

- 501 본문 `{error:"CRON_SECRET is not configured"}`는 `API_ERROR_CODES`(`domain/api.ts:11-19`)의
  멤버가 **아니다.** 정규화할지 그대로 둘지 결정해야 하고, 운영 런북(`OPERATOR-TODO.md:147`)이
  501/401 구분으로 진단한다 — **501/401 분기를 그대로 보존할 것.**
- 통합 근거는 "사본이 늘어난다"가 아니다(그 주장은 거짓이었다). **동작 변경이 세 곳에 동일하게
  착지해야 한다**는 것이다 — 예: `CS-2`의 상수 시간 비교 도입.
- `CS-2`를 함께 처리한다면 `timingSafeEqual` 단순 교체는 안 된다. 길이가 다르면 `RangeError`를
  던져 401이 500이 된다. **양쪽을 해시한 뒤 고정 길이 다이제스트를 비교**해야 한다.

### P3-2 업로드 제약을 `domain/api.ts`로 (`UP-6`)

`PURPOSES`(`services/uploads.ts:41-50`)가 권위인데 클라이언트 **7곳**이 값을 복제한다 —
`PosterUploadField:9,26,49` · `AdminSeminarRecordEditor:193,338` ·
`AdminStudyRecordEditor:281,282` · `admin/gallery/+page.svelte:56`.
`uploads.ts`는 `$env/dynamic/private`에 닿아 컴포넌트에서 import할 수 없다 —
복제는 게으름이 아니라 **경계가 잘못 그어진 결과**다. `domain/api.ts`가 이미 purpose 이름을
단일화했고 제약만 서버에 남겨 두었다.

**주의할 것:**

- **`prefix`는 서버에 남긴다** — 스토리지 레이아웃이지 클라이언트 관심사가 아니다
- `AdminSeminarRecordEditor.svelte:338`의 `accept`는 **두 purpose의 합집합**이다
  (`AdminDirectUploadForm.svelte:50`이 제출 시점에 `file.type`으로 purpose를 고른다).
  단일 purpose에서 파생하는 방식으로는 표현할 수 없다
- `"최대 15MB"` 문구는 상수가 아니라 산문이다. `maxBytes`에서 파생하려면 포매터가 필요하고,
  `PosterUploadField`의 `label` prop이 사라지므로 **컴포넌트 API 변경**이다

---

## P4 — 테스트 공백

두 건 다 구체적인 테스트 형태가 이미 나와 있다.

### P4-1 크론·헬스 라우트 3개에 테스트가 하나도 없다

501 / 401 / 200 / 500 분기와, 무엇보다 **§5-3 불변식("성공 경로에서만 ping")** 이 미검증이다.
그 불변식이 깨지면 시스템의 모든 경보가 거짓말을 한다 — 실제로 그것이 `CS-5`·`CM-4`였다.
`pingHeartbeat`가 자기 오류를 삼키므로(`maintenance.ts:166-170`) **`fetch`를 스파이해야** 관측된다.

패턴은 `maintenance.test.ts:3-6`의 `$env/dynamic/private` 모킹을 그대로 쓴다.

### P4-2 발표자 판정의 **상태 축**이 미검증이다

`participation.test.ts:111-131`이 `getManagedSeminars`의 `memberId` 축은 양방향으로 보지만
상태 축은 보지 않는다. **이 공백이 실제로 회귀를 통과시켰다** — `hasPresenterEvents`에
`active` 필터를 넣어 세미나 끝난 날 자정에 링크가 사라지는 변경이 테스트를 전부 통과했다.

핀으로 박을 것은 두 방향이다: 만료된 세미나가 네비 플래그를 켜지 않는 것, **그리고**
`getManagedSeminars`는 여전히 그것을 목록에 넣는 것(출석 기록이 사후에 일어나므로).

---

## P5 — 계층 감사로 이월 (지금 손대지 않는다)

전부 A-a·A-b 파일 리뷰에서 자연스럽게 만나는 것들이다. 지금 고치면 리뷰 없이 고치는 셈이 된다.

| 발견                                        | 요지                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withCache` 무효화 유실                     | 읽기가 fetcher 안에 있는 동안 쓰기가 `invalidateCache`를 끝내면, 읽기가 **삭제된 뒤에** 낡은 값을 Redis에 다시 쓴다 → 최대 300초간 전 인스턴스가 낡은 값을 본다. `cache.ts:42-45`의 주석이 주장하는 불변식이 깨진다 |
| `cleanupStaging`이 아무것도 안 지울 수 있음 | `listStaged("pending")`이 비재귀 `.list(prefix)`인데 객체는 `pending/<purpose>/<file>`에 있다 → 폴더 행만 반환되고 건너뛴다                                                                                         |
| `maxDuration` 부재                          | 주간 백업이 중간에 죽는 경로가 열려 있다. 스케줄러 타임아웃은 실행 중인 람다를 취소하지 않는다                                                                                                                      |
| `uploadToBackups` lost update               | `upsert: true`, CAS 없음. 겹치면 마지막 쓰기가 이긴다(피해는 낮음)                                                                                                                                                  |
| `CS-6` 스텝 키 충돌                         | `Object.assign`이 한 평면에 병합 → 뒤 스텝이 앞 스텝 키를 덮는다. **그 키들이 곧 경보다**                                                                                                                           |
| `ZR-5` 아카이브 로드 구조                   | `getTable` 9회. C-17로 프리렌더가 없어져 **매 방문이 함수 호출**이 됐으므로 우선순위가 올라갔다                                                                                                                     |
| `K-2` `ASSETS_CDN_URL` 미설정               | 플레이스홀더 대신 깨진 이미지가 렌더된다                                                                                                                                                                            |

---

## 결정 대기 — C-12 ~ C-15

진행에 앞서 답이 필요한 것은 **C-15 하나**다. 나머지는 계층 감사와 병행할 수 있다.

| #        | 질문                                                           | 왜 필요한가                                                                                                                                       |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-15** | `src/lib/client/**`(4개)·`src/lib/domain/**`(26개)의 분리 기준 | **A-c 도메인 계층 리뷰의 선행 조건**이다. 의도된 경계를 모르면 "경계 위반"을 판정할 수 없다. P3-2(업로드 제약을 `domain`으로)도 이 답에 걸린다    |
| C-12     | `scripts/migration/**` 이관 완료 후 존치 여부                  | A4(50파일/3,539줄) 범위가 걸린다. 계층 감사(안 나) 범위 밖이라 급하지 않다                                                                        |
| C-13     | `docs/**` 중 이관 전 작성분의 현행성                           | 코드 감사와 별개 트랙                                                                                                                             |
| C-14     | `.env.example` 대 실제 사용 변수                               | 예시에만 있는 것: `NOTION_API_KEY` · `NOTION_DATABASE_ID`. 코드가 읽는데 예시에 없는 것: `ADMINS_EMAILS`(부트스트랩 관문) · `ADMIN_REFRESH_TOKEN` |

---

## 하지 않기로 한 것 — 근거를 남긴다

되살아나기 쉬운 판단들이라 명시해 둔다.

| 항목                                    | 왜 안 하는가                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 갤러리 블록 3개 파라미터화 (`ZR-2`)     | 날짜 규칙이 다른 것은 **스키마가 다르기 때문**이다 — `GalleryDinnerSchema`에는 `semester`가 없다. 묶으면 "세 규칙이 일치해야 한다"는 **거짓 불변식**을 만든다. 추출할 것은 `thumbUrl/assetUrl` 조각 하나뿐                |
| KST 오프셋 상수 통합 (`ZR-3`)           | 상수는 불변 물리값이라 드리프트가 불가능하다. 통합할 것은 상수가 아니라 **관용구**이고, 특히 `termStartDate`가 `toKstIso`를 재파생하는 것                                                                                 |
| 동적 import를 공용 로더로 추출 (`QA-3`) | **처방이 뒤집힌다.** 통합할 소스가 없고 정적 전환이 안전함을 확인했다 — 답은 삭제다                                                                                                                                       |
| keep-alive 이중 호출 제거 (`HL-4`)      | **어느 쪽을 없애도 손해다.** health를 없애면 잡2가 "함수가 떴다"만 보고하고, maintenance를 없애면 `keptAlive`가 census에서 빠져 500·ping 억제가 무력해진다                                                                |
| `registerCronStep` 하드닝 (`CS-3`)      | 지금 위험하지 않고(모듈 평가가 핸들러보다 항상 먼저), `FRONTEND-DECISIONS.md` §4-3이 그 스텝의 **삭제**를 지시한다. 곧 지울 코드를 굳히는 셈                                                                              |
| GET → POST (`CM-3`)                     | 스펙 3개와 운영자 소유 cron-job.org 설정을 함께 바꿔야 하는데 어떤 테스트·배포 단계도 그것을 검증하지 못한다. **죽은 잡의 위험이 의미론적 이득보다 크다.** 세 관점이 공통으로 짚은 실질 결함(실패의 침묵)은 이미 처리했다 |
| 탈퇴 회원 이름 비공개 (`ZR-9`)          | C-16 결정 — 발표자·조직자 이름은 **사료**다                                                                                                                                                                               |
| 탈퇴 시 `isAdmin` 회수 (`ZA-1` 절반)    | C-18 결정 — 관리자 권한은 최상위 상태이고 회원 상태에 구속되지 않는다                                                                                                                                                     |

---

## 권장 순서

```
P0-1·P0-2  CI 초록으로  ─────────────────┐  이후 모든 작업의 신호를 살린다
P1-1       죽은 PII 페이로드 삭제         │  가장 값싼 실질 개선
P1-2       (admin) 레이아웃 삭제          │  지적 3건 동시 해소
P0-3       CI에 check(+build) 추가        │  P0-1이 끝나야 초록으로 넣을 수 있다
─────────────────────────────────────────┘
C-15 답    →  P2-1 (isMember 의미 확정 후), P3-2
P2-2       ZR-4 — 독립적, 아무 때나
P4-1·P4-2  테스트 공백 — P3 통합 전에 넣는 것이 낫다(리팩터의 안전망)
P3-1·P3-2  단일 소스 통합
─────────────────────────────────────────
A-a 계층 감사 (38파일 / 1,837줄) → P5가 여기서 자연스럽게 처리된다
```

**P0 → P1이 이 목록의 핵심이다.** 둘 다 하루치 작업이 아니고, 하나는 CI를 되살리고
하나는 매 30초 나가던 PII 전송을 멈춘다.
