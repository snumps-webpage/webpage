# `src/lib/server/data/storage-memory.ts` (195줄)

**접두사 `LA37-`** · `storage.ts`의 인메모리 대역. `bucket/path` 키의 `Map` 하나로 세 버킷을 흉내 내며, 서비스 테스트와 `DATA_BACKEND=memory` 개발 백엔드가 쓴다. 테스트 제어(`__stage`·`__exists`·`__setCreatedAt`·`__setRemoveFails`)를 함께 가진다.

이 파일의 기준은 스스로 적어 두었다 — 96-99행: "Service tests run against this, so it must not be more capable than
the real listing." `W-2`(재귀 listing 대역이 `cleanupStaging`의 운영 결함을 가렸다, `PRIORITY.md:78`)가 그 기준의 출처다.
아래 지적 대부분은 그 기준을 **listing 밖으로** 적용한 것이다.

## LA37-1 🟡 `readStagedHead`가 `max`를 무시한다 — 실물보다 유능하다

174-181행은 `_max`를 받고 쓰지 않는다. 실물(`storage.ts:108-109`)은 `buf.subarray(0, maxBytes)`로 자른다.
`__stage`에 긴 `head`를 준 테스트는 운영이 절대 주지 않는 바이트까지 받는다 — 예컨대 `uploads.ts:132`의 `16`을
`4`로 줄이면 운영에서는 PNG의 8바이트 시그니처(`uploads.ts:16`)가 항상 불일치해 모든 PNG 승격이 거절되지만,
테스트는 전체 `head`를 받으므로 통과한다.

이 매개변수는 lint 항목으로 한 번 다뤄졌지만(`PRIORITY.md:514,523` — `argsIgnorePattern: "^_"` 추가로 종결)
그것은 경고를 끈 것이지 **의미를 맞춘 것이 아니다.** `return (obj.head ?? new Uint8Array()).subarray(0, max)`
한 줄이면 된다. 대역의 동작 변경.

덧붙여 이 함수는 150행 `// ---- test controls ----` 아래에 있다 — seam 함수가 테스트 제어 구역에 섞여 있어
"이 모듈이 `storage.ts`의 무엇을 흉내 내는가"를 한눈에 대조할 수 없다.

## LA37-2 🟡 `issuedUrls`는 쓰기만 하고 아무도 읽지 않는다

16행 선언, 35행 `add`, 153행 `clear` — 읽는 곳이 없다. 29행 주석("Records the path as url-issued; a later
`__stage` simulates the browser PUT")은 `__stage`가 이 기록에 기대는 것처럼 읽히지만 `__stage`(158-171행)는
보지 않는다. 즉 **서명 URL 없이 스테이징된 객체**를 테스트가 만들 수 있고, 그것을 막는 듯한 장치는 죽어 있다.

둘 중 하나: `__stage`가 `issuedUrls`를 확인하게 하거나(대역의 동작 변경 — 발급 없는 PUT을 거부),
변수와 주석을 지운다(구조 변경).

## LA37-3 🟡 복사·이동이 같은 객체를 공유한다 — 한쪽을 고치면 다른 쪽도 바뀐다

- `promoteToAssets`(54행)와 `copyToBackups`(65행)는 `objects.set(새키, obj)`로 **같은 객체 참조**를 넣는다.
- `__setCreatedAt`(188-195행)은 그 객체를 제자리에서 고친다(`obj.createdAt = iso`).

`copyToBackups` 뒤에 `__setCreatedAt("backups", "assets-mirror/…", old)`를 하면 `assets` 쪽 원본의 날짜도 바뀐다.
실물의 copy는 **새 객체**이고 `created_at`도 복사 시각이다 — 대역은 원본의 시각을 물려준다.
보존 기간 로직이 미러에 붙는 순간 테스트가 실물과 다른 답을 낸다.

같은 부류로 `uploadToBackups`(134행)의 `bytes: body.length`는 UTF-16 코드 유닛 수이지 바이트가 아니다
(한글 덤프에서 과소). 현재 아무도 백업의 `bytes`를 읽지 않지만 필드 이름이 `bytes`다.

**처방.** 복사 시 `{ ...obj, createdAt: now }`, 크기는 `new TextEncoder().encode(body).length`. 대역의 동작 변경.

## LA37-4 🟡 `__setRemoveFails`가 삭제 셋 중 하나에만 걸린다

82행 `removeAssets`만 `removeFails`를 본다. `removeStaged`(91-93)·`removeBackups`(146-148)는 무시한다.
이름은 "remove가 실패한다"인데, 유지보수 잡(`maintenance.ts:70,140`)의 삭제 실패 경로를 이 스위치로 시험하려는
테스트는 **실패가 주입되지 않은 채 통과**한다. 현재 사용처는 `records-admin.test.ts:211`(자산 삭제) 하나다.

이름을 `__setRemoveAssetsFails`로 좁히거나, 세 삭제 모두에 건다. 대역의 동작 변경(후자) 또는 이름 변경(전자).
`store-memory`의 `__setReadsFail`(`LA39-2`)과 같은 형태 — 스위치의 범위가 이름보다 좁다.

## LA37-5 🟡 `StagedObjectInfo`를 따로 선언한다

24-27행이 `storage.ts:17-20`과 같은 인터페이스를 다시 적는다. `store-memory.ts:16`은 같은 상황에서 `import type`으로
실물의 타입을 가져온다. 실물 쪽에 필드가 늘면 `storage.ts:77`의 `return memory.stagedInfo(path)`에서 컴파일 오류로
잡히지만, 대역 쪽에만 필드가 늘면 잡히지 않는다. `import type { StagedObjectInfo } from "./storage"`로 충분하다.
구조 변경.

## LA37-6 🟡 (검증 추가) 실패 주입이 빈 배열에도 던진다 — 실물은 빈 배열에서 저장소에 가지 않는다

`removeAssets`(81-84행)는 `removeFails`를 **먼저** 보고 던진다. 실물은 `storage.ts:184`의 `if (paths.length === 0) return;`으로
저장소 호출 자체를 하지 않으므로 빈 배열에서는 실패할 수 없다. 즉 `__setRemoveFails(true)` 아래의 `removeAssets([])`는 대역에서만
실패한다 — `LA37-1`과 반대 방향(대역이 실물보다 **무능**)의 불일치다. 실물의 가드가 `storage.ts`에서 메모리 분기(183행) **아래**에
있어서 대역이 그 가드를 물려받지 못하는 구조가 원인이고, `removeStaged`·`removeBackups`도 같은 순서다.
지금 유일한 운영 호출부(`asset-cleanup.ts:44-45`)가 빈 배열을 먼저 거르는 것은 감면 근거가 아니다.

**처방.** 대역에 `if (paths.length === 0) return;`을 먼저 두거나, `storage.ts`에서 빈 배열 가드를 메모리 분기 위로 올린다. 대역의 동작 변경.

## 확인했고 지적하지 않은 것

- **`listLevel`의 한 단계 listing**(95-121행) — `W-2` 이후 `storage-memory.test.ts`가 실물 의미(직계 자식, 상대 이름, 폴더 행의
  빈 타임스탬프)를 고정한다. 정렬을 `localeCompare`로 하는 것은 Postgres 정렬과 대소문자·기호에서 다를 수 있으나,
  두 소비자(`maintenance.ts:48-58,132-140`) 모두 순서에 기대지 않는다
- **`createSignedAssetUrl`이 없는 객체에 `null`**(72-78행) — 실물의 `isNotFound → null`(`storage.ts:167`)과 같은 계약.
  (실물 쪽 판정이 넓은 문제는 `LA38-1`)
- **`createUploadUrl`의 `expiresInSeconds`**(32-34행) — 실물의 죽은 매개변수를 따라 한 것이다. 실물에서 지우면 여기서도 사라진다 — `LA38-4`
- **버킷 이름을 환경 변수 없이 상수로**(18-20행) — 대역은 이름을 해석할 필요가 없고, 키 공간만 나누면 된다
- **`promoteToAssets`/`copyToBackups`가 `Error("NoSuchKey")`로 실패**(53·64행) — 실물 메시지와 형식이 다르지만 호출부
  (`uploads.ts:143-152`)가 메시지를 해석하지 않는다
- **`__reset`이 동기**(151-155행) — `store-memory`와 달리 비동기 자원이 없어 큐가 필요 없다

## 검증 (2026-09-28)

- LA37-1 — 확인 (PNG 시그니처 8바이트 `uploads.ts:16`; `PRIORITY.md:514,523`의 lint 종결 기록 일치)
- LA37-2 — 확인 (`issuedUrls` 참조는 16·35·153행뿐)
- LA37-3 — 확인 (공유가 실제로 생기는 것은 `copyToBackups` 쪽 — `promoteToAssets`는 원 키를 지우므로 소유자가 하나로 남는다)
- LA37-4 — 확인 (`maintenance.ts:70` `removeStaged`, `:140` `removeBackups`; 사용처 `records-admin.test.ts:211,217`)
- LA37-5 — 확인
- LA37-6 — 추가
- 누락 점검: `listLevel`의 정렬·폴더 행, `createSignedAssetUrl`의 `memory.test` URL(운영에서 켜질 때의 결과는 `LA40-1`), `__stage`의 기본
  `head` 부재 시 빈 배열을 봤다 — `LA37-6` 외 새 지적 없음.
