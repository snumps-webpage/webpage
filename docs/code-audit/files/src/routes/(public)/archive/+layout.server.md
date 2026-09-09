# `src/routes/(public)/archive/+layout.server.ts` (157줄)

**접두사 `ZR-`** · 아카이브 셸. `/archive` 하위 전 페이지가 쓰는 공개 스냅샷을 만든다.
위험 우선 묶음에 든 이유: **공개 존에서 회원 데이터를 읽어 내보내는 유일한 로드**다.

## ZR-7 🔴 공개 스냅샷이 프리렌더 정적 HTML에 구워지고, 그것은 캐시 실드 밖이다

`prerender = true`인 아카이브 하위 페이지가 넷이다:

```
(public)/archive/problems/+page.ts · discussions/+page.ts · misc/+page.ts · misc/integration-bee/+page.ts
```

넷 다 **이 서버 레이아웃 아래**에 있다. 그러므로 회원 이름·학과·프로젝트 URL을 담은
스냅샷 전체가 그 페이지들의 빌드 시점 HTML에 직렬화된다 — **그 페이지들은 스냅샷을 표시하지도 않는데.**

`hooks.server.ts:29`가 명시한다: "정적 자산(/_app 등)은 훅을 거치지 않으므로 영향 없다."
즉 **그 산출물은 `no-store` 실드가 적용되지 않고**, 다음 배포까지 낡은 채로 남는다.
배포 후 탈퇴한 회원은 프리렌더 산출물에 계속 게시된다.

레포는 이 패턴을 이미 안다 — 루트 레이아웃이 `executives: building ? null : …`로 막는다
(`+layout.server.ts:23-25`). **아카이브 레이아웃에는 대응물이 없다.**

프리렌더를 유지할지 자체가 결정 사항이다 → `SCOPE.md` C-17

`CROSS-CUTTING.md` XC-2가 기록한 빌드 500(`500 /archive/problems`, `/archive/discussions`)의
메커니즘도 이것이다 — 프리렌더가 이 레이아웃을 실제로 실행한다.

## ZR-8 🔴 공개 아카이브의 금지 키 테스트가 실제 렌더 경로를 덮지 않는다

`lib/server/public/archive.test.ts`가 BE-64 금지 키 스위트(`FORBIDDEN_KEYS`, `:28-44`)로
`getPublic*` 함수들을 감사한다. **그 함수들은 아무것도 렌더하지 않는다.**

아카이브 하위 다섯 서버 로드가 반환하는 props를 읽는 컴포넌트가 없다:

```
grep -rn "data\.\(photos\|projects\|activities\|seminars\|studies\)" src/routes/(public)/archive/  → 0건
```

모든 페이지가 대신 레이아웃의 `data.archive.*`를 읽는다
(`gallery/+page.svelte:26`, `projects:9`, `activities:12,37`, `seminars:10`, `studies:9`).
즉 `gallery/+page.server.ts:6` 외 넷은 매 요청 같은 테이블을 다시 읽는 죽은 작업이다.

**그리고 `+layout.server.ts`를 덮는 테스트는 없다.**
안전망이 감시하는 코드와 공개 데이터를 실제로 만드는 코드가 다르다.
**이것이 ZR-5보다 우선한다.**

## ZR-1 🟠 `dataAvailable: true`는 거짓이 될 수 없는 필드다

154행 리터럴. 51-60행의 `Promise.all`에 try가 없으므로 읽기 실패는 return에 닿기 전에 500이 된다.
소비자 다섯의 else 분기가 전부 죽은 코드다 —
`archive/gallery/+page.svelte:24`, `projects:18`, `activities:33`, `seminars:22`, `studies:20`이
"데이터 이관 후 …"를 렌더하지만 나타날 수 없다.
같은 형태가 `(public)/members/+page.server.ts:9`, `(public)/about/executives/+page.server.ts:7`에도 있다.

## ZR-4 🟠 `1970-01-01` 폴백은 데이터 결함이 아니라 **스키마 불일치가 정상 데이터에서 발동**한 것이다

> **초판 정정**: 🟡 → 🟠. 초판은 이를 "데이터 결함 흡수"로 분류했다. 오진이었다.

```
core/semester.ts:17  SEMESTER_PATTERN = /^\d{2}-(?:[12SW])$/   ← 저장 학기: 여름 S·겨울 W 허용
core/semester.ts:38  TERM_PATTERN     = /^\d{2}-[12]$/         ← termRange가 쓰는 것
core/semester.ts:39      if (!TERM_PATTERN.test(term)) throw new Error(...)
```

`seminars.semester`·`studies.semester`는 `Semester`로 검증되어 `YY-S`·`YY-W`를 허용한다.
스키마 주석이 그 방학 학기가 클럽 사료에 실재한다고 적는다.

그런 학기의 사진 중 연결된 활동 날짜가 없는 것은 전부 43-45행의
`catch { return "1970-01-01" }`에 떨어져 **갤러리에서 1970년으로 정렬된다.**

**정상 데이터에서 발동하는 논리 오류다.** `"Unknown"` 폴백(79·95행)은 초판대로 유효하며,
영문 하드코딩이 한국어 페이지에 노출된다. `1970-01-01`은 두 곳에 따로 적혀 있다(45·133행).

## ZR-2 🟠 갤러리 세 블록이 같은 모양의 복사본이다

101-138행. `thumbUrl(assetUrl(key), 640)` / `displayUrl: assetUrl(key)` 두 줄이
110-111·121-122·134-135행에 그대로 세 번. 사진 출처가 넷째로 늘면 또 복사된다.

## ZR-3 🟠 KST 오프셋이 **세 곳**에 있다

> **초판 정정**: 두 곳이 아니라 셋이다 — `core/time.ts:5`, `core/semester.ts:8`, 그리고 여기 19행.

날카로운 점: 이 파일은 9행에서 `semester.ts`의 `termRange`를 import한다.
**오프셋을 소유한 모듈을 호출하면서 오프셋을 다시 파생한다.**

## ZR-6 🟠 공개 로드가 `seminar-requests` 운영 테이블을 읽는다

59행에서 읽어 76행의 `prerequisites` 하나만 쓴다(`requestOf`는 다른 데서 참조되지 않음).
파일 상단 주석(12-17행)이 "no attendee/applicant lists, no member ids, **no operational state**"를
약속하는데 `seminar-requests`가 그 operational state다.

**범위 정정**: 이 파일만 고쳐도 의존은 사라지지 않는다 —
`archive/seminars/[id]/+page.server.ts:14-32`도 `seminar-requests`를 읽고
거기서는 `description`·`duration`까지 공개한다.

## ZR-5 🟡 테이블 읽기 9회 / 고유 테이블 7개

> **초판 정정**: "테이블 7개"가 아니라 **`getTable` 호출 9회**다.
> `getMemberDirectory()`와 `getDirectoryIndex()`가 각각 `members`+`legacy-members`를 읽는다
> (`data/directory.ts:19-22`, `:29-32`) — 두 테이블을 두 번씩 가져오고 병합을 두 번 계산한다.

> **초판 과장 정정**: "공개 트래픽이 그대로 DB 부하가 된다"는 과하다.
> `getTable`은 `withCache` 300초(Redis) + 로컬 15초 상한을 거치고(`tables.ts:126`, `cache.ts:46-48`),
> `fetchRows`는 `readVersion` 조건부 GET 후에야 `readDoc`을 한다(`tables.ts:57-73`).
> 매번 DB를 읽지는 않는다.

실제 비용은 **SSR 재렌더 + 페이로드**다. cacheShield와 ISR 제거(커밋 `9035cad`)로
CDN이 흡수하지 않으므로 렌더 자체는 매번 돈다. 레이아웃이 아니라 각 페이지가
필요한 조각만 로드하는 구조가 맞다(ZR-8이 그 절반을 이미 요구한다).

## 프라이버시 — 독립 검증 결과 유출 없음

스냅샷의 모든 필드를 출처까지 추적했다. **초판의 칭찬은 정확하다.**

- **projects (140-149행)** — `memberId: \`project-${index}\``는 실제로 불투명하고 `m.id`는 나가지 않는다.
`m.status !== "withdrawn"`필터는 요청 즉시 유효하다 —`services/withdrawal.ts:42-58`이
유예 종료가 아니라 **요청 시점에** status를 바꾼다.
공개 필드는 `name`·`department`·`project.title`·`project.url`뿐.
`PrivateInfoSchema`의 `email`/`phone`/`background`/`studentId`/`mailPrefs`, `isAdmin`,
`withdrawal`, `roles`, `joinedAt`, `publicContact` **전부 제외**
- **seminars (69-86행)** — `presenterIds`는 이름으로만 해석(62·79행). `posterKey`·`preferredTiming`·
  `sourceRequestId` 제외. 신청서에서는 `prerequisites`만 — `requesterId`·`status`·`attachment` 미접근
- **studies (87-97행)** — `participantIds`·`pendingParticipantIds`·`pendingTransfer`·
  `transferHistory`·`schedule[].generatedEventId`·`status` 전부 제외
- **activities (98-100행)** — `attendeeIds` 제외
- **gallery** — S3 키만

**PII·회원 행 id·참석자/신청자 명단 어느 것도 스냅샷에 닿지 않는다.**

## ZR-9 🟡 탈퇴 필터가 세 이름 표면 중 하나만 덮는다

`nameOf`(62행)는 필터되지 않은 `getDirectoryIndex()`에서 만들어진다.
따라서 탈퇴 회원의 이름은 `presenterNames`(79행)·`organizerNames`(95행)로 **여전히 공개된다.**
`lib/server/public/archive.ts:18-21`의 `memberNameMap()`과 일관되므로 사료 보존 의도로 보이나,
141행만 칭찬하고 이 비대칭을 침묵하는 것은 옳지 않다. **명시적 결정이 필요하다** → `SCOPE.md` C-16

## ZR-10 🟡 원시 S3 키를 요소 id로 게시한다

`fileReference`가 `id: s3Key`를 반환한다(29행). 반면 `archive.test.ts`는
"resolves asset keys to URLs, never raw keys alone"를 단언한다.
영향은 낮지만(키는 이미 URL 안에 있다) **명시된 계약과 어긋난다.**

## ZR-11 🟡 `project-${index}`는 불안정한 리스트 키다

인덱스는 **필터된** 배열의 위치다. 회원 하나가 추가·탈퇴하면 이후 키가 전부 밀린다.
`projectIndexItems`가 이를 `item.id`로 넘기고 `PublicIndexList`가 `{#each}` 키로 쓴다.
불투명하다는 점은 맞으나 **위치 기반이라 정렬 순서를 노출하고**
(운영 회원이 legacy보다 앞, `directory.ts:24`) 안정적 식별자가 아니다.
