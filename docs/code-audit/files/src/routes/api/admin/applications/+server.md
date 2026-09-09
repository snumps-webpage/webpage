# `src/routes/api/admin/applications/+server.ts` (25줄)

**접두사 `QA-`** · 관리자 폴링용 대기 가입신청 목록 (§8-3 / BE-56).

## QA-5 🟠 응답의 절반이 아무도 읽지 않는 신청자 PII다

```ts
18  return json({
19    applications: sorted.map(applicationView),   // ← 소비자 없음
20    success: true,
22    items: sorted.map(adminApplicationItem),
23    generatedAt: nowKstIso(),
```

유일한 소비자 `fetchAdminQueue`(`client/api.ts:80-88`)가 `queueResponseEnvelopeSchema`로 파싱한다:

```ts
domain/api.ts:26-30
z.object({ success: z.literal(true), items: z.array(z.unknown()), generatedAt: ... })
```

비-strict `z.object`라 **`applications` 키는 파싱 단계에서 버려진다.** `result.data`만 반환된다.
소비자는 `.items`만 읽는다(`(admin)/admin/+page.svelte:67-69`, `admin/seminars:37`, `admin/studies:30`).
다른 fetcher는 없다.

즉 **매 폴링마다 같은 행을 두 번 투영해 직렬화하고, 한 벌은 버려진다.**
그리고 이 엔드포인트에서 버려지는 그 한 벌이 신청자 PII 전체다 —
`applicationView`(`views.ts:41-52`)가 `email` · `phone` · `studentId` · `background`를 담는다.

폴링 주기는 30초, 폴러는 두 개다(`admin/+page.svelte:64`, `admin/seminars/+page.svelte:35`,
`client/admin-queue-poller.ts:9`). 같은 죽은 키가 `seminar-requests:20` · `study-requests:20`에도 있다.

**초판은 15-17행의 정렬을 논하면서 바로 위 19행이 소비되지 않는다는 것을 보지 못했다.**

## QA-1 🟡 세 엔드포인트가 같은 골격의 복사본이다

> **초판 정정**: 🟠 → 🟡, 그리고 **주장한 피해가 거짓이다.**

구조 중복은 사실이다(`applications:7-24`, `seminar-requests:7-25`, `study-requests:7-25`).
뒤의 둘은 식별자만 다르다(`diff` 결과 26줄 중 6줄, 전부 이름 — 단 6행의 `/ BE-56` 태그는 예외).

그러나 초판이 적은 피해 — "봉투가 바뀌면 폴러가 그 큐에서만 **조용히** 다른 모양을 받는다" — 는 **틀렸다.**
봉투는 `queueResponseEnvelopeSchema`로 중앙화돼 있고 `fetchAdminQueue`가 `safeParse` 후
`INVALID_RESPONSE`를 던진다(`client/api.ts:80-88`). **조용할 수 없다. 그 큐만 시끄럽게 죽는다.**

실제 드리프트 위험은 다른 데 있다: **봉투 키가 세 파일에 손으로 적혀 있고 스키마는 네 번째 파일에 있다.**

또 초판의 차이 표가 불완전해 처방이 맞지 않는다. 실제로는 셋이 이렇게도 다르다:

|                               | applications                    | seminar/study-requests   |
| ----------------------------- | ------------------------------- | ------------------------ |
| `directorySummaryIndex()`     | 없음                            | 있음 (18행)              |
| item 함수 인자                | 1개 (`admin-queue-views.ts:44`) | 2개 (`:63`, `:92`)       |
| 정렬/필터                     | 정렬                            | 필터                     |
| item에 `status`·`canWithdraw` | 없음                            | study만 있음 (`:92-112`) |

`adminQueueEndpoint({table, view, item, key, filter?})`는 이 넷 중 하나도 흡수하지 못한다.
→ `CROSS-CUTTING.md` XC-7이 이 제약을 반영해야 한다.

## QA-2 ❌ 철회 — 전제가 거짓이었다

초판: "`applications`는 필터하지 않아 이미 처리된 신청도 나간다."

**`applications` 테이블에는 status 필드가 없고 미처리 행만 담는다.**

```
schemas/application.ts:4-8
🔒 Holds ONLY unprocessed applications — no status field.
Approval converts the row into members/private-info and removes it;
rejection and self-withdrawal remove it too (API-SPEC §2).
```

`membership.ts`가 승인·거절·본인철회 모두에서 행을 삭제한다(`:185-203`).
하류도 같은 불변식을 전제한다 — `applicationView`가 `accepted: false`를 상수로 두고(`views.ts:50`),
`adminApplicationItem`이 `createdAt`에서 `consentAt`을 파생한다(`admin-queue-views.ts:55-57`).

`status === "pending"` 필터는 **컴파일되지 않는다.** 반면 `seminar-requests`·`study-requests`는
`status: RequestStatus`를 갖고 처리된 행을 남긴다(`schemas/seminar-request.ts:23`, `study-request.ts:12`).

**비대칭은 두 데이터 모델의 차이가 강제한 것이지 실수가 아니다.** 셋 다 정확히 미처리 집합을 반환한다.
정렬 유무도 SSR 로드와 일치한다(`(admin)/admin/+page.server.ts:53-61` vs `:128-146`).

> **교훈**: "셋이 다르니 하나는 틀렸다"는 대칭성 논증이다. 데이터 모델을 확인하기 전에는 지적이 아니다.

## QA-3 🟡 정적 의존을 동적으로 부른다 — 한 파일에 세 번

12-14행. 세 모듈 모두 조건 없이 매 요청 쓰인다. 세 파일에 반복(호출 9회, 심볼 12개).

**같은 모듈이 다른 곳에서는 정적으로 import된다** — `admin-queue-views`는
`(admin)/admin/+page.server.ts:25-29`에서, `views`는 `(applicant)/+layout.server.ts:2`에서.
순환 의존 회피가 아님이 증명된다. 이전 감사 `X-9`와 같은 습관.

## QA-4 🟡 헬퍼가 두 호출 맥락을 하나의 반환형에 섞었다

8-9행. `requireAdminAction`은 거부 시 `fail(403,...)`을 준다(`auth-guards.ts:68-71`) —
폼 액션 전용이라 엔드포인트가 못 쓴다. `response`를 소비하는 곳은 액션 래퍼(`:178`) 하나뿐이다.

그 결과 403 본문이 **네 곳**에 손으로 적혔다 — 이 세 파일 + `api/uploads/presign:26-27`.
(초판은 세 곳으로 셌다.)

## QA-6 🟡 403이 소비자에게서 사라진다

`fetchAdminQueue`가 던지는 `ApiRequestError`를 세 소비자가 전부 `catch {}`로 받아
"직전 목록을 표시합니다"로 바꾼다(`admin/+page.svelte:74-76`, `seminars:38-41`, `studies:31-34`).
**세션 중 권한이 회수된 관리자는 아무 신호도 못 받고 이미 DOM에 있는 PII와 함께 낡은 큐를 계속 본다.**

## 확인했고 지적하지 않은 것

- 가드가 **핸들러 안**에 있다 — `zone.ts:92-94`가 api 존을 통과시키므로 이것이 유일한 관문이고 올바른 위치다
