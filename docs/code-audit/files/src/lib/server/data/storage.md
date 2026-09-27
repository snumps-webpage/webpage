# `src/lib/server/data/storage.ts` (273줄)

**접두사 `LA38-`** · 객체 저장소 seam. Supabase Storage의 세 버킷(`staging`·`assets`·`backups`)에 대한 서명 업로드 URL, 스테이징 조회·헤더 읽기, 승격(move), B3 미러(copy), 서명 읽기 URL, 삭제·목록·덤프 업로드. `DATA_BACKEND=memory`이면 `storage-memory.ts`로 넘긴다.

## LA38-1 🟠 `isNotFound`가 "버킷이 없다"와 "객체가 없다"를 가르지 못한다

> **검증 정정**: 🟠 유지, 표의 105행 줄만 좁힌다. 버킷 이름이 틀린 경우 `promotePendingUpload`는 **같은 스테이징 버킷**에
> `stagedInfo`(82행)를 먼저 부르고 거기서 `null` → `NOT_FOUND`로 끝난다(`uploads.ts:122-123`). 그 시나리오에서
> `readStagedHead`(105행)에는 도달하지 않으므로 "파일 형식이 확장자와 일치하지 않습니다"는 버킷 오타의 결과가 아니다.
> 105행의 오분류가 드러나는 경우는 `info`와 `download` 사이에 객체가 사라진 경우(정리 잡과의 경합) — 그때 "없음"이 형식 오류 문구로
> 나간다. 82행과 167행 두 줄의 결론, 그리고 `isNotFound`가 `Bucket not found`를 `/not.?found/i`로 삼킨다는 핵심은 맞다.

41-49행은 `status === 404` · `statusCode === "404"` · `/not.?found/i.test(message)` 중 하나면 참이다.
Supabase Storage는 **버킷이 없을 때도** 404 / `"Bucket not found"`를 준다 — 세 조건 모두에 걸린다.

이 판정을 쓰는 세 곳이 모두 "없음"을 정상 결과로 바꾼다:

| 행  | 함수                   | 버킷 이름이 틀렸을 때                                                                          |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| 82  | `stagedInfo`           | `null` → `uploads.ts:123`이 `NOT_FOUND`("never uploaded or already reaped") — 편집자 탓이 된다 |
| 105 | `readStagedHead`       | `null` → `uploads.ts:133`이 "파일 형식이 확장자와 일치하지 않습니다"                           |
| 167 | `createSignedAssetUrl` | `null` → `media/[...key]/+server.ts:58`이 **모든 자산을 404**로 — 로그 한 줄 없이              |

버킷 이름은 `SUPABASE_*_BUCKET` 환경 변수(22-32행)에서 온다. 오타 하나로 사이트의 모든 이미지·자료가
"없는 파일"이 되고, 운영자는 5xx도 로그도 보지 못한다. 오류를 삼키는 방향이 가장 나쁜 쪽이다.

**처방.** 객체 부재만 `null`로(예: 메시지가 `Object not found`이거나 `code === "NoSuchKey"`/`not_found`),
나머지 404는 throw. **동작 변경**(설정 오류가 500 + 로그가 된다).

## LA38-2 🟠 `stagedInfo`가 크기를 모르면 0으로 답한다 — 크기 상한이 열린다

86행 `size: data.size ?? 0`. 87행 `contentType: data.contentType ?? "application/octet-stream"`.

두 기본값의 방향이 반대다. 타입 기본값은 허용 목록에 없으므로 **닫힌다**(`uploads.ts:126`에서 거절).
크기 기본값 0은 `info.size > spec.maxBytes`(`uploads.ts:125`)를 **항상 통과한다.** 서명 업로드 URL은 크기를
강제하지 못하므로(`uploads.ts:31-32`, 이 파일 54-57행) `stagedInfo`가 크기 상한의 **유일한** 집행점이다.
크기를 모르는 객체는 상한 검사를 건너뛰고 `readStagedHead`(LA38-3)로 가서 통째로 내려받힌다.

"`info()`는 실제로 항상 size를 준다"는 SDK 응답의 성질이다. 코드가 `??`로 부재를 **처리하기로** 한 이상,
처리 방향은 fail-closed여야 한다.

**처방.** 크기가 없으면 `null`(없음) 또는 throw. **동작 변경**(size 없는 응답에서 승격 거절).

## LA38-3 🟡 16바이트를 보려고 최대 50MB를 메모리에 받는다 — 주석의 상한이 틀렸다

96-110행. 주석(94행)은 "전체를 받아 앞부분만 취한다(포스터 ≤15MB)"라고 적는다. 그러나 호출부는 모든 목적에 대해
`readStagedHead(pendingKey, 16)`(`uploads.ts:132`)을 부르고, `seminar-material`의 상한은 **50MB**다(`uploads.ts:45`).
주석이 비용을 3분의 1 이하로 적는다. 그리고 LA38-2가 열려 있는 동안에는 상한 자체가 보장되지 않는다.

주석의 "Supabase JS는 range download가 없어"는 **SDK 메서드**에 대한 사실이다. 서명 URL(`createSignedUrl`)에 `Range`
헤더를 붙여 `fetch`하는 우회로가 검토된 흔적은 없다 — 검토하고 기각했다면 그 이유를 주석에 남길 것.

최소 수정은 주석 정정(문서). 우회 적용은 구조 변경(결과 동일).

## LA38-4 🟡 아무 일도 하지 않는 매개변수 둘

- `createUploadUrl(path, expiresInSeconds?)`(59-64행): 받아서 `void`로 버린다. 근거는 "signature parity with the old
  presigner"(56행)인데 **옛 presigner는 없어졌고**(AWS → Supabase 이행), 유일한 호출부 `uploads.ts:103`은 두 번째 인자를
  넘기지 않는다. `storage-memory.ts:32-34`가 이 죽은 매개변수를 다시 흉내 낸다.
- `copyToBackups(sourceBucket: "assets", ...)`(132-141행): 타입이 리터럴 하나뿐이고, 본문은 그 값을 쓰지 않고
  `assetsBucket()`을 부른다. 호출부(`uploads.ts:147`)는 `"assets"`를 적어 넣는다.

둘 다 "호출자가 조절할 수 있다"는 인상을 주지만 조절되는 것이 없다. `createUploadUrl`의 경우 누군가 만료를
짧게 주려고 값을 넘기면 **조용히 무시된다**(주석을 읽지 않는 한). 제거는 구조 변경.

## LA38-5 🟡 모듈 주석이 `assets` 버킷을 "public"이라고 부른다

6-8행: "public `assets` for promoted files". 같은 파일 152-154행은 "the bucket itself is private"이고,
`media/[...key]/+server.ts:7`·`ARCHITECTURE.md:92`도 비공개를 전제한다(전환은 `OPERATOR-TODO.md` §3-1,
`scripts/ops/ops-assets-private.mjs`). 한 파일 안에서 머리말과 본문이 반대를 말한다.
(`uploads.ts:34`의 "public assets bucket"과 마이그레이션 `20260901000000_documents.sql:73-74,83`의 `public=true`도
같은 전환 이전 서술이다 — 각 파일의 몫이다.)

문서 정정.

## LA38-6 🟡 버킷마다 같은 함수를 한 벌씩

- 버킷 이름 해석 세 벌(22-32행) — 기본값만 다르다.
- 삭제 세 벌: `removeAssets`(182-192) · `removeStaged`(194-204) · `removeBackups`(263-273) — 버킷과 로그 라벨만 다르고
  빈 배열 가드·오류 형식까지 같다.

같은 파일의 `listAll(bucket, prefix, label)`(214-230행)이 이미 "버킷을 인자로 받는 private 헬퍼 + 얇은 공개 함수"
형태를 보여 준다. 삭제에도 같은 형태를 쓰면 버킷을 하나 늘릴 때 세 곳이 아니라 한 곳이 는다. 구조 변경.

## 확인했고 지적하지 않은 것

- **`DATA_BACKEND=memory` 분기 13곳**(63·77·100·120·137·161·183·195·235·246·258·264행) — 운영 번들·가드 부재 문제의
  근원이 `store.ts`와 같다. `LA40-1`에 모았다. 운영에서 이 분기가 켜지면 여기서는 `https://memory.test/upload/…`가 실제
  브라우저로 나간다(`storage-memory.ts:36`) — 그 결과도 `LA40-1`에 적었다
- **`listAll`의 페이지네이션**(206-230행) — `W-2` 이후 `storage.test.ts:52-80`이 고정한다. 폴더 행의 `created_at: null` → `""`
  매핑도 같은 테스트가 본다
- **`promoteToAssets`가 원자적이지 않다**(112-129행) — 주석이 인정하고 잔여물은 정리 잡 몫이라고 적는다(스펙 §4-2). 설계 결정이다
- **`removeAssets`가 백업 미러를 건드리지 않는다**(173-181행) — 복구 경로라는 이유가 적혀 있고 맞다
- **`createSignedAssetUrl`에서만 `error as StorageErrorLike` 캐스트**(167행) — 다른 두 곳과 모양이 달라 보이지만 판정은 같다.
  캐스트 자체는 해가 없다
- **`uploadToBackups`가 `application/json`을 박는다**(249행) — 주석(241행)이 "B1 dump writer"로 범위를 밝히고 호출부도 덤프
  하나다(`maintenance.ts:172`). 범용 업로더로 쓰일 때 재검토
- **환경 변수를 호출마다 읽는다**(22-32행) — `$env/dynamic/private` 접근 비용은 무시할 만하다

## 검증 (2026-09-28)

- LA38-1 — 정정 (🟠 유지, 표의 105행 결과를 "버킷 오타"에서 "info와 download 사이의 소실"로 좁힘)
- LA38-2 — 확인
- LA38-3 — 확인 (`uploads.ts:45` 50MB, `:132` `readStagedHead(pendingKey, 16)`)
- LA38-4 — 확인 (`createUploadUrl` 호출부 `uploads.ts:103` 하나, 두 번째 인자 없음)
- LA38-5 — 확인 (`ARCHITECTURE.md:92`는 HEAD 기준 — 현재 작업 트리에서는 130행)
- LA38-6 — 확인
- "확인했고" 첫 항목의 "분기 13곳"은 **12곳**이다(나열된 행 번호도 12개). `LA40-1` 검증 정정 참조.
- 누락 점검: `listAll`의 종료 조건, `createSignedAssetUrl`의 `data?.signedUrl ?? null`, 세 삭제 함수에서 메모리 분기가 빈 배열 가드보다
  앞에 있는 순서(그 결과는 대역 쪽 `LA37-6`에 적었다)를 봤다 — 새 지적 없음.
