# `src/lib/server/services/uploads.ts` (172줄)

**접두사 `LB32-`** · 업로드 파이프라인 — 용도(purpose)별 타입·크기 표, 서명 업로드 URL 발급(스테이징 `pending/`), 승격(크기·타입·매직 바이트 검증 → assets 이동 → backups 미러), 세미나 포스터 승격 헬퍼.

## LB32-1 🟠 `isUploadPurpose`가 프로토타입 키를 용도로 인정한다

> **검증 확인**: 🟠 유지. 런타임 실측으로 인과 재현 — `isUploadPurpose("constructor"|"toString"|"__proto__"|"hasOwnProperty")`가 모두 `true`,
> `createPresignedUpload({purpose:"constructor", …})`가 `TypeError: Cannot read properties of undefined (reading 'includes')`(88행)로 터진다(500).
> 브리핑 질문 답: 이 함수에 purpose를 넘기는 엔드포인트는 **POST `/api/uploads/presign`** 하나다. 그 라우트는 body를 **두 번** `z.enum`으로 거른다 —
> 28행 `uploadPurposeSchema.safeParse`(capability 라우팅용)와 43행 `presignBodySchema.safeParse`(purpose가 `uploadPurposeSchema`). 검증 통과분(`parsed.data`)만
> `createPresignedUpload`→`isUploadPurpose`에 닿으므로 **이 라우트로는 프로토타입 키가 절대 도달하지 못한다.** 그러나 (a) 도달성은 등급이 아니라 증상 크기의
> 축이고(README 판정 기준), (b) 이 함수는 `v is UploadPurpose`를 선언해 스스로 검증을 자임하는 타입 가드다 — 상위 스키마가 막는다는 것은 감면 근거가 아니다. 🟠 정당.

61행 `return v in PURPOSES`. `in`은 프로토타입 체인을 본다 — `"constructor"`, `"toString"`, `"__proto__"`,
`"hasOwnProperty"`가 모두 `true`다. 타입 가드가 `v is UploadPurpose`라고 선언했으므로 다음 줄(87행)의 `PURPOSES[input.purpose]`는
`Object`·`Object.prototype` 따위가 되고, 88행 `spec.types.includes`가 `TypeError`로 터진다. 실측:

```
constructor true  TypeError: Cannot read properties of undefined (reading 'includes')
toString    true  TypeError: …
__proto__   true  TypeError: …
```

`VALIDATION_FAILED`(400)여야 할 입력이 잡히지 않은 예외(500)가 된다. 지금은 presign 라우트가 먼저 `z.enum`으로
거르지만(`api/uploads/presign/+server.ts:43`, `domain/api.ts:50`), 이 함수는 **스스로 입력을 검증한다고 주장하는 서비스의
타입 가드**다 — 상위 계층이 막는다는 것은 감면 근거가 아니다(README 판정 기준).

처방: `Object.hasOwn(PURPOSES, v)`. **동작 변경**(해당 입력에서 500 → 400).

## LB32-2 🟠 용도 목록과 용도별 제한이 여러 곳에 복사돼 있다

용도의 **이름**이 두 곳에 있고 둘은 컴파일 시점에 연결되지 않는다.

| 위치                  | 내용                                                | 쓰는 쪽                 |
| --------------------- | --------------------------------------------------- | ----------------------- |
| 이 파일 41-56, 58     | `PURPOSES` 키 + `type UploadPurpose`                | 서비스·편집기 라우트    |
| `domain/api.ts:38-46` | `UPLOAD_PURPOSES` + **같은 이름의** `UploadPurpose` | presign 라우트의 스키마 |

한쪽에만 용도를 추가하면: 도메인에만 있으면 라우트는 받고 서비스가 `VALIDATION_FAILED`로 거부하며, 이 파일에만 있으면
라우트가 400으로 막는다. 어느 쪽도 타입 오류가 나지 않는다.

용도별 **제한**(타입·크기)은 서버 전용 모듈(`$lib/server`)에 있어 클라이언트가 import할 수 없고, 그래서 손으로 복사돼 있다.

- `PosterUploadField.svelte:26` `15_000_000`, `:56` `accept="image/png,image/jpeg"` — 49-53행의 사본
- `admin/gallery/+page.svelte:156`, `AdminStudyRecordEditor.svelte:285`, `AdminSeminarRecordEditor.svelte:349`의 `accept` 목록
- `upload-validation.ts:3-6` — 셋째 표. 이미지 10 **MiB**(`10 * 1024 * 1024`)·PDF 50 MiB로, 이 파일의 10 **MB**(`10_000_000`)·50 MB와
  **다른 숫자**다. 운영 호출부가 없다(테스트만) — 그 파일 문서의 지적 대상이지만, 다음 사람이 "업로드 한도"를 찾을 때 먼저
  걸리는 곳이 이 틀린 사본일 수 있다.

한도를 바꾸면 클라이언트 사전 검사가 조용히 어긋난다(서버가 다시 검사하므로 결과는 "클라이언트는 받고 승격에서 거부" 또는
"유효한 파일을 클라이언트가 거부"). 처방: 용도 표(이름·타입·크기)를 `$lib/domain`으로 옮겨 서버·라우트 스키마·클라이언트가
같은 값을 import. **구조만**.

## LB32-3 🟠 WebP 시그니처가 "RIFF"만 본다 — 아무 RIFF 파일이나 `image/webp`로 승격된다

> **검증 확인**: 🟠 유지. 실측 — 머리 16바이트가 `RIFF….WAVE`(WAV)인 스테이징 객체를 `contentType:"image/webp"`로 올리면
> 승격이 통과해 `gallery/…/…-a.webp` 키가 생긴다. 18행 주석이 밝힌 검사 목적(바이트로 Content-Type 위조 차단)이 WebP에서만 달성되지 않는다.
> 132행이 이미 16바이트를 읽으므로 오프셋 8-11의 `WEBP` 확인은 추가 I/O 없이 가능하다. 처방 타당.

18행이 `52 49 46 46`("RIFF")만 확인하고 주석이 "WEBP는 8바이트 뒤 확인 생략"이라고 적는다. RIFF는 컨테이너다 —
WAV(`RIFF….WAVE`), AVI(`RIFF….AVI `)도 같은 4바이트로 시작한다. 12-13행과 131행이 밝힌 이 검사의 목적("Content-Type 위조를
실제 바이트로 차단")이 네 타입 중 하나에서 달성되지 않는다.

생략할 이유도 없다 — 132행이 이미 16바이트를 읽는다. 8-11바이트가 `57 45 42 50`("WEBP")인지 보는 것은 시그니처 표에
오프셋 하나를 더하는 일이다. 처방: 시그니처에 오프셋을 허용(`{ at: 8, bytes: [...] }`). **동작 변경**(비-WebP RIFF 거부).

## LB32-4 🟠 저장 키의 확장자가 클라이언트가 보낸 그대로다 — 정제되지 않고, 검증된 타입과 무관하다

> **검증 확인 + 결과 범위 확정**: 🟠 유지. 실측으로 네 결과를 모두 재현했다 —
> `report.p d f?#` → 최종 키 `…/tok-report.p d f?#`, `/media/${key}`가 인코딩 없이 만들어져 `?#` 뒤가 잘려 나가 요청 경로가 저장 키와 달라진다(디코드 후 불일치).
> `a.jpg ` → 후행 공백이 키에 남고 `/media` 경로에서 트림돼 불일치. `q.%3fjpg` → 리터럴 `%3f`가 키에 남고 `/media`가 `?`로 디코드해 불일치.
> `contentFileFromKey`(`admin-queue-views.ts:131-140`)가 `image/${확장자}`를 만드는 것도 확인 — `.jpg`→`image/jpg`, 확장자 없음→`image/bin`.
>
> **브리핑 질문(폴더/접두사 탈출·타 객체 덮어쓰기·asset-access 우회) 답 — 셋 다 특권 상승으로는 이어지지 않는다:**
>
> - **탈출/덮어쓰기**: 확장자에 `/`·`..` 세그먼트를 넣으면 최종 키의 경로 부분을 다시 쓸 수 있으나 (a) 최종 키에 `randomToken(8)`(80비트)가 박혀 표적 충돌·덮어쓰기가 실효 불가,
>   (b) storage-js가 버킷 id를 경로 첫 세그먼트로 **앞에** 붙이므로(`_getFinalPath`) 버킷 경계를 넘는 크로스버킷 탈출은 불가능하다. 실현되는 해는 **깨진 키**이지 남의 객체 탈취가 아니다.
> - **asset-access 우회**: `resolveAssetAccess`는 저장된 기록 키와 **정확 문자열 일치**로만 판정하고(36-61행), 17행이 `key.includes("..")`면 무조건 `"none"`을 준다.
>   크래프트된 키는 기록에 그대로 저장되므로 접근 판정은 여전히 동등 비교로 옳게 돌아간다 — 다만 `..`를 담은 키는 강제로 `"none"`이 되어 `/media`가 **404**를 낸다.
>   즉 우회가 아니라 **그 기록 자기 파일을 스스로 못 받게 되는** 자해적 접근 불능이다. 결론: LB32-4의 인과(URL 파손·역추론 MIME 오염)는 모두 참, 여기에 "탈출·탈취 아님, 자해적 불능"을 덧붙인다.

`slugifyFilename`은 본문(slug)은 `[a-z0-9가-힣-]`로 정제하지만(71-76행) **확장자는 정제하지 않는다**(70행 — `toLowerCase`뿐).
확장자는 마지막 `.` 뒤 전부라서 `/`, `?`, `#`, 공백을 담을 수 있다. 실측:

```
"a.x/../../gallery-photo/p" → pending/seminar-poster/ID-a-x./gallery-photo/p
"report.p d f?#"            → pending/seminar-poster/ID-report.p d f?#
"a.jpg "                    → pending/seminar-poster/ID-a.jpg␠
```

이 값이 스테이징 경로(102행)가 되고, 승격 때 139-141행이 파일명의 id 뒤 부분을 **그대로** 최종 키에 옮긴다. 결과:

- **URL이 깨진다** — `assetUrl`이 `/media/${s3Key}`를 인코딩 없이 만든다(`public/archive.ts:32`). `?`·`#` 뒤는 쿼리·조각이 된다.
- **타입이 확장자에서 거꾸로 추론된다** — `contentFileFromKey`가 `image/${확장자}`를 만든다(`admin-queue-views.ts:138-140`).
  `.jpg`는 `image/jpg`(존재하지 않는 MIME), 확장자 없는 파일은 `image/bin`이 된다. 검증을 통과한 실제 타입(`info.contentType`)은
  키 어디에도 남지 않는다.
- 확장자에 `/`가 있으면 139행의 "마지막 `/` 뒤"가 slug를 잃는다(`…/tok-p`).
- 134-136행의 사용자 문구 "파일 형식이 **확장자와** 일치하지 않습니다"는 사실이 아니다 — 확장자는 어디서도 비교되지 않는다.
  비교되는 것은 바이트와 Content-Type이다.

처방: 확장자를 검증된 `contentType`에서 만든다(`image/png → png` …), 문구를 "파일 내용이 형식과 일치하지 않습니다"로.
**동작 변경**(새 키의 확장자 형태).

## LB32-5 🟡 경로 한정이 문자열 접두사 검사뿐이다 — 그리고 두 번 한다

> **검증 확인 + 범위 주석**: 🟡 유지. 접두사만 보는 계약 위반은 사실이다. 다만 실현 범위는 LB32-4와 같이 제한적이다 — 리터럴 `..` 세그먼트로 스테이징 경로를
> 재작성해도 storage-js가 버킷 id를 앞에 붙여 버킷 경계는 못 넘고, 그렇게 생긴 최종 키는 `..` 때문에 `resolveAssetAccess`가 404로 막는다(LB32-4 검증 참조). 계약 결함으로서 지적은 정당.

117행 `pendingKey.startsWith(\`pending/${purpose}/\`)`는 `pending/seminar-poster/../gallery-photo/x`를 통과시킨다.
이 키가 어디를 가리킬지는 저장소의 키 해석에 달렸다 — 서비스가 "이 용도의 스테이징 폴더 안"이라는 자기 계약을 스스로 지키지
않는다. `seminar-poster`는 등록 회원 전체가 쓰는 용도다(`presign/+server.ts:33-35`). 처방: `..`세그먼트·선행`/`를 거부하거나
`pending/<purpose>/<ULID>-<slug>.<ext>` 형태를 정규식으로 강제. **동작 변경**(좁음).

`promoteSeminarPoster` 166-170행이 같은 접두사 검사를 다시 한다 — 사용자 문구를 바꾸려는 것뿐이다. 159행 주석은 "경로·purpose
검증은 promotePendingUpload가 담당"이라고 적어, 주석과 코드가 서로를 부정한다. 처방: `promotePendingUpload`가 문구를 싣게 하고
166-170 삭제. **구조만**(문구 하나 통일).

## LB32-6 🟡 승격은 되돌릴 수 없는 이동인데, 기록 존재 확인보다 먼저 일어난다

143행 `promoteToAssets`는 **이동**이다 — 스테이징 원본이 사라진다. `recordId`는 141행에 검증 없이 들어간다. 세 호출부가 모두
승격 후 기록에 붙인다(`admin/gallery/+page.server.ts:115-120`, `admin/studies/+page.server.ts:180-185`,
`admin/seminars/+page.server.ts:321-326` — `setXPhotos`/`setSeminarFiles`가 그 뒤에 `NOT_FOUND`를 던진다). 없는 기록 id나 경합으로
지워진 기록이면 파일은 assets로 옮겨졌는데 아무 기록도 가리키지 않는다. `forgetUnreferencedAssets`(`asset-cleanup.ts:36`)는
기록에서 빠지거나 교체된 키만 넘겨받으므로(`records-admin.ts:143,161,187,247,333`) 이 고아는 영원히 남는다. `data.get("id") as string`이 `null`이면 키는 `studies/null/…`이 된다.

`promoteSeminarPoster`(171행)는 `recordId`로 **새 `newId()`**를 넘긴다 — 어떤 기록과도 무관한 id라, 키 형식
`<prefix>/<recordId>/…`가 약속하는 "기록별 폴더"가 포스터에서는 의미가 없다. 호출부는 행 id를 이미 가지고 있다 —
생성 경로는 같은 객체 리터럴에서 `id: newId()`를 먼저 평가하고(`seminar-requests.ts:38,41`, `records-admin.ts:79,92`),
수정 경로(`seminar-requests.ts:71`, `records-admin.ts:117`)는 인자로 받은 `id`가 있다. 넘길 길이 없을 뿐이다. 처방: 행 id를 먼저 만들어 넘기고, 승격 전에 기록 존재를 확인하는 계약을
서비스 시그니처로 드러낸다(예: `promoteFor(recordExists, …)`). **동작 변경**(좁음).

## LB32-7 🟡 백업 미러 실패가 로그 한 줄로만 남는다

148-152행. 미러가 게이트가 아니라는 판단(149-150행 주석)은 옳다. 그러나 145-146행이 스스로 이것을 "S3 버전 관리의 대체"라고
부르는데, 실패하면 **그 자산에는 복구본이 없고 그 사실을 아는 곳이 콘솔 로그뿐**이다. 재시도·재대조하는 잡도 없다
(`maintenance.ts:144`의 TODO는 미러 정리이지 누락 보충이 아니다). `CS-5`·`CM-4`가 크론에서 고친 것과 같은 형태 — 삼킨 실패가
관측되지 않는다. 처방: 실패한 키를 기록(감사 로그나 표)해 유지보수 잡이 다시 복사. **동작 변경**(부수효과 추가).

## LB32-8 🟡 시그니처 표와 용도 표가 연결되지 않는다

`PURPOSES[*].types`(41-56행)와 `SIGNATURES` 키(15-20행)는 따로 관리된다. 용도에 타입을 추가하고 시그니처를 빠뜨리면 24행의
fail-closed 때문에 **그 타입의 모든 업로드가** "파일 형식이 확장자와 일치하지 않습니다"로 거부된다 — 사용자에게는 파일 문제로
보인다. fail-closed 자체는 옳다. 연결이 타입으로 표현되지 않은 것이 문제다. 처방: `types`를 `(keyof typeof SIGNATURES)[]`로
타입 지정. **구조만**.

## LB32-9 🟡 파일 머리 주석이 현재 저장 모델과 다르다

- 34행 "public assets bucket" — `storage.ts:150-155`는 assets 버킷이 비공개이고 모든 읽기가 앱의 서명 URL을 거친다고 적는다
  (`ASSETS_ACCESS`, `public/archive.ts:32`).
- 31-32행 "stagedInfo() enforces the size/type caps" — `stagedInfo`는 메타데이터를 돌려줄 뿐이고 강제는 이 파일 124-130행이 한다.
- `readStagedHead`의 근거 주석 "포스터 ≤15MB"(`storage.ts:94`) — 이 파일은 그 함수를 **모든 용도**에 부른다(132행). 16바이트를
  보려고 최대 50 MB PDF(45행) 전체를 서버리스 메모리에 받는다. 비용이 주석의 가정보다 3배 이상 크다.

**구조만**(주석) / 셋째는 range 읽기(`Range` 헤더로 signed URL fetch)로 바꾸면 **동작 변경 없음**.

## 확인했고 지적하지 않은 것

- **크기·타입 검사가 발급(88-97)과 승격(124-130) 두 번 있다** — 중복이 아니다. 서명 업로드 URL이 Content-Type·크기를 서명하지 못하므로(`storage.ts:54-57`) 발급 시 검사는 안내, 승격 시 검사가 강제다. 주석(31-32)이 그렇게 설계를 밝힌다
- **미정의 타입의 시그니처를 통과시키지 않는다**(24행) — fail-closed가 옳다(LB32-8은 연결 문제만)
- **JPEG `FF D8 FF`, PNG 8바이트, PDF `%PDF`** — 표준 시그니처와 일치한다
- **승격 후 같은 키 재승격은 `NOT_FOUND`** — 이동이므로 둘째 `stagedInfo`가 `null`. 이중 등록 방지로 동작한다
- **`s3Key` 필드명** — 104행 주석대로 동결된 API 표면(SYS-03)
- **스테이징 키가 업로더에 묶이지 않는다** — 등록 회원 누구든 남의 `pending/seminar-poster/…` 키를 알면 승격할 수 있다. 키에 ULID(80비트 무작위)가 들어가 추측할 수 없고 발급 응답으로만 전달되므로 지적하지 않는다
- **`stagedInfo`의 `size: data.size ?? 0`**(`storage.ts:86`) — 크기 메타데이터가 없으면 0이 되어 125행 상한 검사를 통과한다. 이 파일이 의존하는 값이지만 결함의 자리는 `storage.ts`다 — 그 문서에서 다룰 것
- **`randomToken(8)`**(141행) — 키 충돌 방지용. `core/id.ts`의 모듈로 편향은 그 파일의 문제
- **TODO(BE-52)** — 파생 이미지 미구현은 기능 공백이지 결함이 아니다

## 커버리지

`uploads.test.ts`가 발급 검증, 승격(정상·접두사 밖·미존재·크기/타입 위조·매직 바이트 위조·실제 JPEG), `slugifyFilename`의
한글·기본값을 덮는다. **`isUploadPurpose`의 프로토타입 키, 확장자 정제, WebP 이외의 RIFF, 미러 실패 경로는 테스트가 없다.**

## 검증 (2026-09-28)

- LB32-1 — 확인 (런타임 실측: 프로토타입 키 4종 `true`, `constructor` presign이 `TypeError`(500). 도달 엔드포인트·이중 z.enum 검증 확인)
- LB32-2 — 확인 (숫자 대조: `upload-validation.ts:5` `10*1024*1024` vs 이 파일 `10_000_000`, PDF `50*1024*1024` vs `50_000_000`; `PosterUploadField.svelte:26` `15_000_000`·`:56` accept, 세 `accept` 목록 실재)
- LB32-3 — 확인 (런타임: `RIFF….WAVE`를 `image/webp`로 승격 성공)
- LB32-4 — 확인 (네 결과 실측 재현 + 탈출·덮어쓰기·asset-access 우회 분석 추가: 특권 상승 없음, 자해적 접근 불능·URL 파손·MIME 오염이 실현 범위)
- LB32-5 — 확인 (범위 주석 추가: 버킷 경계 못 넘음, `..` 키는 asset-access가 404)
- LB32-6 — 확인 (`promoteToAssets`는 이동, 승격 후 기록 부착. `promoteSeminarPoster`가 `newId()`를 recordId로 넘김 171행. 세 호출부가 승격 뒤 `setX`로 `NOT_FOUND` 던짐 확인)
- LB32-7 — 확인 (145-146 자기 설명 "S3 버전 관리 대체" vs 148-151 로그 후 진행; 재시도 잡 없음)
- LB32-8 — 확인 (`SIGNATURES` 키와 `PURPOSES[*].types`가 타입으로 연결 안 됨; fail-closed는 옳음)
- LB32-9 — 확인 (34행 "public assets bucket" vs `storage.ts:150-155` 비공개; `readStagedHead`가 132행에서 모든 용도에 전체 다운로드, 50MB PDF 포함 — `storage.ts:96-110` 확인)
- 누락 점검: `slugifyFilename`의 slug는 정제되나 ext는 미정제(70행) 확인. 발급/승격 이중 검사·fail-closed·frozen `s3Key`·ULID 스테이징 키 등 "확인했고 지적하지 않은 것" 항목 모두 코드와 일치. 추가 지적 없음.
