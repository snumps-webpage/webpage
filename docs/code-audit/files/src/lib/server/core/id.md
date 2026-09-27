# `src/lib/server/core/id.ts` (17줄)

**접두사 `LA05-`** · 레코드 id(ULID)와 URL용 무작위 토큰 생성.

## LA05-1 🟡 `randomToken`의 문자 분포가 균등하지 않다 (modulo bias)

16행 `alphabet[b % alphabet.length]` — 바이트(0-255)를 36으로 나누면 256 = 36×7 + 4 이므로
`a`·`b`·`c`·`d` 네 글자는 8/256, 나머지 32글자는 7/256 확률로 나온다(앞 네 글자가 **약 14% 더 자주**).
"무작위 토큰"이라는 계약에 대해 논리적으로 틀린 분포다. 글자당 엔트로피가 log₂36 ≈ 5.17비트보다 조금 낮고,
추측자는 앞 네 글자를 우선 시도하면 된다.

이 토큰은 추측 방지가 목적인 곳에 쓰인다 — 출석 링크 `pathId`·`attendCode`
(`events.ts:112-113`, `seminars.ts:116-117`, `studies.ts:197-198`), 스토리지 키 난독화(`uploads.ts:141`).
10자 기준 실효 엔트로피 손실은 작으므로 🟡이지만, 정정 비용도 작다.

처방: 거절 샘플링(`b < 252`만 사용) 또는 32자 알파벳(256이 32의 배수). **동작 변경**은 분포뿐이고
형식(`[a-z0-9]`, 길이)은 그대로다.

## LA05-2 🟡 주석이 함수가 주지 않는 보장과 사라진 저장소를 적는다

4-6행: "lexicographic order == creation order, which is the only ordering the index-less S3 tables get for free."

- **순서 보장이 없다.** `ulid` 패키지의 `ulid()`는 단조(monotonic) 팩토리가 아니다. 같은 밀리초에 만든
  두 id는 무작위 부분이 정렬을 정하므로 생성 순서와 사전식 순서가 어긋날 수 있다. 보장이 필요하면
  `monotonicFactory()`를 써야 한다. 지금 id 정렬로 생성 순서를 얻는 코드는 없지만(`grep` 확인),
  주석은 바로 그렇게 쓰라고 권한다
- **"S3 tables"는 사라졌다.** 저장소는 v0.7부터 Postgres `app_tables` 문서 행이다(`API-SPEC.md:8,63`,
  `ARCHITECTURE.md` Data Layer)

12행 `randomToken` 주석도 "attendance links (pathId/attendCode)"로 용도를 좁게 적지만 `uploads.ts:141`이
키 난독화에 8자로 쓴다.

처방: 주석을 "ms 단위 시간순, 같은 ms 안에서는 순서 없음"으로 고치거나 `monotonicFactory()`로 바꾼다.
전자는 **문서만**, 후자는 **동작 변경**(같은 ms 내 id 형태).

## 확인했고 지적하지 않은 것

- **`crypto.getRandomValues`** (15행) — CSPRNG다. `Math.random`이 아니다
- **기본 길이 10** — 36¹⁰ ≈ 3.7×10¹⁵. 출석 링크 추측 방지에 충분하다. 호출부가 길이를 고를 수 있다
- **`newId()`가 `ulid()`의 얇은 래퍼** — id 체계를 한 곳에서 바꿀 수 있게 하는 seam이다. 과한 추상이 아니다
- **토큰 충돌 검사 없음** — 출석 링크는 `pathId`·`attendCode` 두 토큰을 함께 쓰고(`events.ts:240`) 공간이 충분히 크다

## 검증 (2026-09-28)

- LA05-1 — 확인 (256 = 36×7 + 4이므로 `a`–`d`는 8/256, 나머지는 7/256이다. 호출부는 `events.ts:112-113`, `seminars.ts:116-117`, `studies.ts:197-198`, `uploads.ts:141`)
- LA05-2 — 확인 (`ulid` 3.0.2의 `ulid()`는 `encodeTime + encodeRandom`이고 단조 팩토리는 `monotonicFactory`뿐이다(`node_modules/ulid/dist/node/index.js:252,274`). id로 순서를 매기는 곳은 테스트 헬퍼 `store-memory.ts:235`의 `order by at, id` 타이브레이크 하나로, 운영 코드에는 없다)
- 누락 점검: 두 함수의 호출부와 `ulid` 구현을 대조했다. 새 지적은 없다.
