# `src/routes/api/uploads/presign/+server.ts` (42줄)

**접두사 `UP-`** · presigned PUT 발급. 관리자 전용이 기본, `seminar-poster` purpose만 등록 회원에게 개방.

> **재검증 CONFIRMED · 수정 완료 (2026-09-10).** 반증 시도가 모든 경로를 확인했다 —
> 다른 훅·레이아웃 없음, `hasSessionCookie`는 `(public)` 분기에만 OR되므로 api 조기 반환을
> 막지 못함, 대체 호출 경로 없음, 회원 UI 경로에 게이팅 없음.
> **수정**: `auth-guards.ts`에 `requireCapabilityAction`을 추가했다 —
> `resolveAdminContext`와 같은 지연 해석 + `locals` 쓰기백이라, 관리자 폴백 경로가
> `resolveMember`를 다시 부르지 않는다. `presign:22-24`가 그것을 쓴다.

## UP-1 🔴 회원의 포스터 업로드가 프로덕션에서 항상 403이다

```ts
22  const isMemberPoster =
23    body.purpose === "seminar-poster" &&
24    locals.member?.capabilities.includes(CAPABILITIES.PARTICIPATE);
25  if (!isMemberPoster) {
26    const { allowed } = await requireAdminAction(locals);
```

`locals.member`는 **api 존에서 절대 채워지지 않는다.** `hooks.server.ts:86-91`이 존 가드보다 먼저 빠져나간다.
`locals.member`에 값을 넣는 곳은 셋뿐이고, api 요청에서 24행보다 먼저 도는 것은 없다:

| 위치                                        | api 요청에서                                              |
| ------------------------------------------- | --------------------------------------------------------- |
| `hooks.server.ts:47` (devPreview)           | **dev에서만** — `dev-preview.ts:20 if (!dev) return null` |
| `hooks.server.ts:97` (zoneGuard)            | 86행에서 이미 return                                      |
| `auth-guards.ts:24` (`resolveAdminContext`) | presign 26행 — **24행보다 뒤**                            |

`auth-guards.ts:23-24`가 정확히 이 핸들러에 필요한 해석을 한다 — **한 문장 늦게.**

도달 경로: `(member)/seminar/apply|edit/[id]/+page.svelte:21` → `SeminarRequestForm.svelte:370`
→ `SeminarPosterSection.svelte:42`(`posterMode === 'upload'` 토글) → `PosterUploadField.svelte:33`
→ `client/api.ts:115` POST. 실패는 `PosterUploadField.svelte:36-39`가 삼켜
"포스터 업로드에 실패했습니다"만 남긴다 — 상태 코드와 원인은 사라진다.

**dev에서는 동작한다.** `devPreviewHandle`은 api 존에도 적용되고
`capabilitiesFor({isAlumni:false, registered:true})`에 PARTICIPATE가 있다(`core/capabilities.ts:34-36`).
프리뷰로 검증하면 통과하고 실제 세션에서만 깨진다.

**처방**: `zone.ts:92-94`가 "api 인증은 각 핸들러가 한다"고 계약을 정했으므로,
이 핸들러가 자기 주체를 스스로 해석해야 한다 → `CROSS-CUTTING.md` XC-6

## UP-2 🟡 인가 분기 입력이 요청 본문이다 — 구조 문제이지 취약점은 아니다

> **초판 정정**: 🟠 → 🟡. 초판은 "안전의 근거가 다른 계층에 있다"고 적었는데 **그 진단이 틀렸다.**

게이트를 고르는 값(23행)과 자원을 정하는 값(32행)이 **같은 변수이고 사이에서 변하지 않는다.**
`request.json()`은 `JSON.parse`라 getter/TOCTOU가 없다. `"seminar-poster"`를 골라 회원 게이트를
통과한 클라이언트는 `seminar-poster` presign만 얻는다. 게이트와 자원이 어긋나지 않는다 —
**이 핸들러는 자기 계약을 지키고 있다**(README의 정당한 감면 근거).

남는 것은 구조다: purpose→필요 capability를 **표가 아니라 인라인 문자열 비교로** 적었다.
회원에게 열리는 purpose가 하나 더 생기면 이 분기가 복제된다.

## UP-3 🟡 요청 스키마가 이미 있는데 실제 전송 형태와 어긋나 있다

```ts
32  purpose: body.purpose ?? "", filename: body.filename ?? "", ... size: body.size ?? 0,
```

누락 필드가 빈 값으로 바뀌어 "필드 없음"과 "빈 값 보냄"이 구별되지 않는다. 여기까지는 초판대로다.

> **초판 정정**: "`domain/api.ts:56`이 요청 형태를 이미 타입으로 적어 두었으니 쓰면 된다"는 **틀렸다.**

```ts
domain/api.ts:47-52
export const presignRequestSchema = z.object({
  operationId: z.uuid(),   // ← 서버는 이 필드를 받지 않는다
  purpose, filename, contentType, size,
});
```

클라이언트는 `Omit<PresignRequest, "operationId">`를 보낸다(`client/api.ts:108`, 주석 106-107행:
"operationId is kept client-side"). **이 스키마를 그대로 적용하면 모든 정상 요청이 거부된다.**

즉 진짜 지적은 검증 부재가 아니라 **계약 드리프트**다 —
요청 스키마와 실제 와이어 형태가 이미 갈라져 있고, 아무도 모른다(런타임에서 쓰이지 않으니까).

## UP-4 🟡 sanctioned accessor를 우회한다

24행이 `locals.member?.capabilities.includes(...)`를 직접 쓴다.
레포의 공인 접근자는 `hasCapability`(`core/capabilities.ts:44`)이고
`auth-guards.ts:145`·`zone.ts:144`가 그것을 쓴다. 우회하는 곳은 여기와 `hooks.server.ts:122` 둘뿐이다.
`capabilities.ts:1-7`의 규약("호출부는 requireCapability만 쓴다")이 깨진 지점이다.

## UP-5 🟡 회원 경로에 인증이 없다

`isMemberPoster` 분기는 `locals.auth()`를 부르지 않는다. 훅이 `locals`에 남긴 것을 그냥 믿는다.
현재는 세션 파생값(또는 dev preview)만 거기 오므로 악용되지 않지만,
**핸들러 자신은 그 보장을 갖고 있지 않다.** UP-1을 "locals.member를 채워주면 된다"로 고치면
이 가정을 그대로 물려받는다.

## 확인했고 지적하지 않은 것

- `AppError`만 잡고 나머지는 재던짐(38-40행) — 계층 경계로서 올바르다
- ~~"15MB·PNG/JPEG 상수가 `services/uploads.ts:45` 단일 진실이다"~~ →
  **틀렸다.** `PosterUploadField.svelte:9,21,26`이 `['image/png','image/jpeg']` · `15_000_000` ·
  "최대 15MB"를 클라이언트에 하드코딩한다. **면제가 아니라 지적이었어야 한다** → UP-6

## UP-6 🟡 업로드 제약이 서버·클라이언트 두 곳에 하드코딩돼 있다

| 위치                               | 값                                                        |
| ---------------------------------- | --------------------------------------------------------- |
| `services/uploads.ts:45`           | `types: ["image/png","image/jpeg"], maxBytes: 15_000_000` |
| `PosterUploadField.svelte:21,26,9` | 같은 값 세 번 (검사 2회 + 라벨 문구)                      |

서버 한도를 올리면 클라이언트가 먼저 거부한다. 반대도 마찬가지다.
클라이언트 선검사 자체는 UX상 정당하나, **값이 복제돼 있다.**
