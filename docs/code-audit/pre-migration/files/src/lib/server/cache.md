# `src/lib/server/cache.ts`

134줄 · export 2개 · 2단(Redis + 인메모리) 캐시
검토 2026-08-28 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 **철회된 주장을 되살려 인용했다** — `activities.md` AC-1이
> "새로고침해도 반영되지 않는다"를 **틀렸다고 명시하고 그 때문에 🔴→🟠로 강등**했는데,
> 초판이 그것을 AC-1의 주장인 것처럼 인용하고 1순위 수정의 근거로 삼았다.
> 그 밖에 호출부 집계가 틀렸고(10→7), CA-1의 수정이 CA-12를 유발한다. §개정 이력 참조.

> 이 파일은 `CROSS-CUTTING.md` X-3의 종착점이다 —
> `auth-guards.md` AG-3, `events.md` SE-3·SE-15가 여기로 수렴한다.

> 판정 기준은 `README.md` §판정 기준. "`REDIS_URL`이 없어서 안 돈다"는 감면 근거가 아니다.
> 이 파일의 절반이 Redis 경로이고 X-3의 처방이 그것을 켜는 것이다.
> **단, 그것을 "지금 관측되는 증상의 원인"이라고 말해서도 안 된다.** 초판이 그 선을 넘었다.

---

## 요약

| # | 지적 | 분류 | 심각도 |
|---|---|---|---|
| **CA-13** | **fetcher가 삼킨 실패·빈 결과가 그대로 캐시되고 Redis로 확산된다** | 버그 | 🔴 |
| **CA-2** | **캐시가 살아 있는 참조를 내주고, 호출부 2곳이 제자리 변형한다** | 버그 | 🔴 |
| **CA-1** | **`skipCache: true`가 로컬만 갱신하고 Redis에 낡은 값을 남긴다** | 버그 | 🔴 |
| CA-14 | 키에 버전·네임스페이스가 없어 배포를 건너 살아남는다 | 정합성 | 🟠 |
| CA-15 | `commandTimeout` 미설정 — 캐시가 캐시 대상보다 느려질 수 있다 | 견고성 | 🟠 |
| CA-6 | 같은 키인데 로컬 히트와 Redis 히트가 다른 값을 낸다 | 정합성 | 🟠 |
| CA-3 | Redis 백필이 남은 수명을 무시해 로컬이 Redis보다 오래 산다 | 버그 | 🟠 |
| CA-5 | Redis 오류를 삼키고, 핸들러는 **가장 흔한 장애를 제외**한다 | 운영 | 🟠 |
| CA-4 | in-flight 중복 제거가 없다 | 성능 | 🟠 |
| CA-10 | 무효화 API가 빈약하다 — 접두사도, 배치도 없다 | 설계 | 🟠 |
| CA-17 | `withCache<T>`가 키와 타입을 묶지 않는다 | 타입 | 🟡 |
| CA-7 | 정리가 **미스 경로에서만, 5% 확률로** 돈다 | 설계 | 🟡 |
| CA-8 | 축출이 anti-LRU다 — **가장 자주 갱신되는 키가 먼저 버려진다** | 설계 | 🟡 |
| CA-16 | `MAX_LOCAL_SIZE`가 바이트가 아니라 항목 수를 센다 | 설계 | 🟡 |
| CA-9 | 만료 기준 시각이 fetcher 실행 **전**이다 | 정확성 | 🟡 |
| CA-12 | `ttlMs = 0`이 "캐시 안 함"으로 쓰이는데 계약이 아니다 | 계약 | 🟡 |
| CA-11 | 매직 넘버 5개 + 호출부 TTL 12개가 근거 없이 흩어져 있다 | 하드코딩 | 🟡 |

**호출부 전수** — `withCache` 12곳, `invalidateCache` 2곳(`auth-guards.ts:109`, `:164`).

| # | 위치 | 키 | TTL | `{ skipCache }` |
|---|---|---|---|---|
| 1 | `notion/applications.ts:17` | `application_${email}` | 60000 | ✅ `:41` |
| 2 | `notion/applications.ts:46` | `all_applications` | 60000 | ✅ `:66` |
| 3 | `notion/members.ts:56` | `member_${email}` | 300000 | ✅ `:87` |
| 4 | `notion/members.ts:104` | `all_members` | 60000 | ✅ `:131` |
| 5 | `notion/members.ts:136` | `latest_executives` | 3600000 | ❌ **3인자** |
| 6 | `notion/events.ts:148` | `schema_${databaseId}` | 3600000 | ❌ **3인자** |
| 7 | `server/events.ts:21` | `all_events` | `skipCache ? 0 : 60000` | ✅ `:32` |
| 8 | `server/events.ts:114` | `attendance_queue` | `skipCache ? 0 : 30000` | ✅ `:129` |
| 9 | `notion/activities.ts:20` | `activities_${s}_${e}` | 300000 | ✅ `:60` |
| 10 | `notion/activities.ts:65` | `all_activities` | 60000 | ❌ **3인자** |
| 11 | `notion/activities.ts:91` | `user_activities_${memberId}` | 300000 | ✅ `:121` |
| 12 | `notion/seminars.ts:72` | `all_seminar_requests` | 60000 | ✅ `:119` |

---

## CA-13 🔴 삼킨 실패가 캐시된다

`withCache`는 fetcher가 **던지지 않으면 성공으로 본다.** fetcher 안에서 오류를 잡아
폴백을 반환하면 **그 폴백이 캐시된다.** 그리고 `:105-108`이 그것을 **Redis로 밀어
전 인스턴스에 퍼뜨린다.**

`server/events.ts:24-31`:

```ts
async () => {
  try {
    return (await getEventsFromNotion()) as Event[];
  } catch (e) {
    console.error("Failed to fetch events from Notion:", e);
    return [];                                   // ← 60초간 캐시된다
  }
},
```

같은 형태가 다섯 곳이다:

| 위치 | 폴백 | 캐시 수명 |
|---|---|---|
| `server/events.ts:29` | `[]` (Notion 예외) | 60초 |
| `server/events.ts:126` | `[]` (Notion 예외) | 30초 |
| `notion/applications.ts:22` · `:51` | `null` / `[]` (DB id 부재) | 60초 |
| `notion/seminars.ts:77` | `[]` (DB id 부재) | 60초 |

**Notion 429 한 번이 빈 배열을 60초간 공유 캐시에 못 박는다.**
`notion/client.md` C-2가 **429 처리·재시도가 없다**고 지적했으므로
일시 스로틀이 곧바로 이 경로다.

`notion/seminars.md` S-1은 더 나쁘다 — `filter_properties`에 없는 속성이 들어가
**조회가 항상 400으로 죽고** `seminars.ts:28-34`가 `[]`를 돌려준다.
그 `[]`가 매번 새로 캐시된다.

### 무엇이 빠졌나

**"이 결과를 캐시하지 마라"를 표현할 수단이 `withCache`에 없다.**
fetcher는 성공/실패만 말할 수 있고(던지거나 값을 주거나),
"값은 있는데 신뢰할 수 없다"를 말할 방법이 없다.

호출부가 fetcher 안에서 오류를 삼키는 것도 결함이지만(`CROSS-CUTTING.md` X-10),
**캐시가 그것을 걸러낼 계약을 안 준 것**이 이 파일의 몫이다.

```ts
withCache(key, ttl, fetcher, { skipCache, shouldCache: (d) => d !== null })
```
또는 fetcher가 `CACHE_SKIP` 심볼을 반환할 수 있게 한다.

---

## CA-2 🔴 캐시가 살아 있는 참조를 내주고, 호출부가 그것을 변형한다

`:79` `return local.data as T;` — **저장된 객체 자체**를 돌려준다.
`:102` `localCache.set(key, { data, … })` — fetcher가 만든 객체 **자체**를 저장한다.
복사도 `Object.freeze`도 없다.

`Array.prototype.sort`는 제자리 정렬이다. 확인된 오염 두 곳:

| 위치 | 코드 | 캐시까지의 경로 |
|---|---|---|
| `admin/+page.server.ts:45` | `apps.sort(…)` | `getApplications` → `admin.ts:96` 순수 위임 → `withCache("all_applications")`. **같은 참조** |
| `api/admin/applications/+server.ts:12` | `apps.sort(…)` | 〃 |

> **초판 오탐 철회.** 초판은 `api/admin/seminar-requests/+server.ts:20`도 넣었다. **틀렸다.**
> `:18-19`가 `.filter((r) => r.status === "pending")`로 **새 배열을 만든 뒤** 정렬한다.
> 캐시 배열은 건드리지 않는다. **인용한 줄 바로 위를 안 읽었다.**

### 이 코드베이스는 이미 갈라져 있다

`admin/+page.server.ts:53`은 **복사한다** — `return [...events].reverse();`
같은 파일 `:45`는 복사하지 않는다.
**누군가는 알고 누군가는 몰랐다**는 뜻이고, 규약이 없으니 다음 사람도 모른다.

### 왜 "지금 정렬 결과가 같으니 괜찮다"가 아닌가

두 비교 함수가 결정적이라 재정렬이 멱등이므로 **오늘은 증상이 없다.** 남는 사실:

- 캐시가 **불변식을 잃었다.** 저장한 값과 다음에 읽을 값이 같다는 보장이 없다
- 로컬 티어(변형됨)와 Redis 티어(변형 전 JSON)가 **영구히 갈라진다**(CA-6)
- 다음에 `.push()`나 `.splice()`를 쓰면 조용히 데이터가 오염된다

캐시가 참조를 공유하는 것은 **캐시의 계약 위반**이지 호출부의 부주의가 아니다.
`structuredClone`이 비싸다면 최소한 `Object.freeze`로 계약을 강제할 수 있다.

---

## CA-1 🔴 `skipCache: true`가 Redis에 낡은 값을 남긴다

`:98-112`:

```ts
const data = await fetcher();
localCache.set(key, { data, expiry: now + ttlMs });        // ← skipCache와 무관하게 항상
if (redis && !options?.skipCache) {                        // ← skipCache면 건너뜀
  await redis.set(key, JSON.stringify(data), "PX", ttlMs);
}
```

**두 티어의 쓰기 조건이 다르다.** `skipCache: true`는 "새로 읽어라"인데
그 결과가 **한 티어에만 반영된다.**

| 티어 | `skipCache: true` 이후 |
|---|---|
| 로컬 (이 인스턴스) | **새 값** |
| Redis (전 인스턴스 공유) | **옛 값 그대로**, 원래 만료까지 |
| 다른 인스턴스의 로컬 | Redis에서 **옛 값**을 백필(CA-3) |

옛 값이 Redis에서 다른 인스턴스로 **재확산**된다.

### 노출 범위 — 7곳

`skipCache`를 실제로 넘기는 호출부는 **9곳**이고, 그중
`server/events.ts:21`·`:114`는 TTL이 `0`이라 **로컬 절반만** 무해해진다
(`expiry: now + 0`이 즉시 만료). **Redis 절반은 두 곳도 동일하게 낡은 채로 남는다.**

3인자 호출 3곳(`latest_executives`, `schema_${dbId}`, `all_activities`)은
`options`가 `undefined`라 이 경로에 못 온다.

> **초판 정정.** 초판은 "12곳 중 **10곳**이 이 경로"라고 썼고
> `events.ts` 두 곳은 "TTL 0이라 상쇄된다"고 했다. **둘 다 틀렸다.**
> 3인자 호출 셋을 세지 않았어야 했고(→ 7), `events.ts` 두 곳의 **Redis 절반은 상쇄되지 않는다.**

### 오늘 관측되는 증상은 아니다

`REDIS_URL`이 설정돼 있지 않으므로 지금은 Redis 티어 자체가 없다.
**결함은 그대로다** — 코드가 두 티어를 다르게 쓰는 것은 설정과 무관하다.

> **초판 날조 철회.** 초판은 이것이 `activities.md` AC-1의
> "새로고침 버튼을 눌러도 낫지 않는다"의 기계적 원인이라고 썼다.
> **AC-1은 그 주장을 명시적으로 철회했다** —
> `activities.md:147-152`: *"초판은 '새로고침해도 반영되지 않는다'고 썼다. **틀렸다.**
> 대시보드에 새로고침 버튼이 있다 … `skipCache`를 켜고 캐시를 통째로 우회한다."*
> AC-1은 **바로 그 철회 때문에 🔴→🟠로 강등**됐다(`activities.md:278`).
> 초판은 철회된 주장을 되살려 그 문서를 출처로 달고 1순위 수정의 근거로 삼았다.

### 수정 — CA-12를 함께 고쳐야 한다

`:105`를 `if (redis)`로 바꾸면 `events.ts:23`·`:116`이 `skipCache: true`일 때
`redis.set(key, json, "PX", 0)`에 도달한다. **Redis는 `PX 0`을 거부한다**(CA-12) —
`:109`의 빈 catch가 그것을 삼켜 두 키의 Redis 티어가 **영영 갱신되지 않는다.**

**CA-12를 먼저 또는 동시에** 고쳐야 한다. 두 티어의 쓰기 조건을 맞추되
`ttlMs <= 0`이면 양쪽 다 저장하지 않는 것이 옳다.

---

## CA-14 🟠 키에 버전도 네임스페이스도 없다

`withCache`가 받은 키를 **그대로** Redis 키로 쓴다(`:85`, `:108`, `:129`).
앱 버전도, 스키마 버전도, 배포 식별자도 붙지 않는다.
`invalidateCache`에는 전체 플러시가 없고, 배포 시 도는 코드도 없다.

Redis는 **배포를 건너 살아남는다.** 버전 N이 쓴 값을 버전 N+1이 읽는다.
`schema_${dbId}`와 `latest_executives`는 TTL이 1시간이므로,
객체 모양을 바꾸는 배포 뒤 최대 한 시간 동안 **옛 모양이 반환된다.**

로컬 티어는 프로세스와 함께 죽으므로 이 문제가 없다 — **또 하나의 티어 간 비대칭**이다.

키 앞에 빌드 식별자(`v3:member_...`)를 붙이면 배포가 곧 무효화가 된다.

> 초판은 이것을 「지적하지 않은 것」에서
> "fetcher 안에서 `validateNotionResponse`가 이미 돌았다"는 이유로 통과시켰다.
> **틀렸다.** 그것은 **쓰기 시점** 보장이고 Redis는 **배포를 건너는** 저장소다.
> 게다가 초판이 근거로 든 그 검증기는 `notion/utils.md` U-1이 밝혔듯
> 실패해도 원본을 통과시킨다 — **스스로 무력하다고 적어둔 것을 근거로 삼았다.**

---

## CA-15 🟠 캐시가 캐시 대상보다 느려질 수 있다

`:20` `connectTimeout: 5000`은 **연결** 타임아웃이다.
`commandTimeout`은 코드베이스에 **0건**이다:

```
$ grep -rn "commandTimeout" src/
(0건)
```

연결은 됐는데 응답이 없는 Redis(스왑, 네트워크 정체, `SAVE` 중 블로킹)에서
`:85` `await redis.get(key)`가 **무기한 멈춘다.** `:99`의 fetcher 폴백은
그 뒤에 있으므로 도달하지 않는다.

**빠른 경로가 느린 경로보다 느려질 수 있는 캐시는 캐시가 아니다.**
`notion/client.md` C-5가 Notion 호출에 `AbortSignal`이 없다고 지적했는데,
그쪽은 최소한 플랫폼 타임아웃이 상한을 건다. 여기는 그 앞에서 잡아먹는다.

`commandTimeout: 200` 정도면 충분하다 — 넘으면 fetcher로 떨어지면 된다.
`maxRetriesPerRequest: 1`(`:19`)은 **명령 재시도**를 제한할 뿐 시간을 제한하지 않는다.

---

## CA-6 🟠 같은 키가 두 티어에서 다른 값을 낸다

| 히트 티어 | 반환 |
|---|---|
| 로컬 (`:79`) | fetcher가 만든 **원본 객체 참조** |
| Redis (`:87-90`) | `JSON.parse(JSON.stringify(원본))` |

JSON 왕복이 지우는 것: `Date` → 문자열, `undefined` 필드 → **삭제**,
`Map`/`Set` → `{}`, `NaN`/`Infinity` → `null`, 프로토타입 전부.

도메인에 실제로 걸린다 — `Member.privateInfoId`가 `undefined`일 수 있고
(`members.ts:96`, `notion/schema.md` SC-9), 로컬 히트에서는 `"privateInfoId" in obj`가 참,
Redis 히트에서는 거짓이다. **같은 코드가 캐시 티어에 따라 다르게 동작한다.**

CA-2와 무관하게 성립한다 — 변형이 전혀 없어도 두 티어의 값이 다르다.

**로컬 티어도 직렬화를 거치게 하면** 두 티어가 같아지고 CA-2도 함께 닫힌다.

---

## CA-3 🟠 백필이 남은 수명을 무시한다

`:89` `localCache.set(key, { data, expiry: now + Math.min(ttlMs, 60000) });`

Redis에서 읽어온 값이 **거기 얼마나 있었는지 보지 않는다.**
`pttl`은 코드베이스에 0건이다.

`member_${email}`(TTL 300초)이 Redis에서 299초째일 때 읽히면
로컬은 그때부터 60초를 더 산다 → **총 359초.** TTL 계약이 깨진다.

무효화와의 상호작용도 있다 — 인스턴스 A가 `invalidateCache`로 양 티어를 지워도,
직전에 백필한 인스턴스 B는 최대 60초간 삭제된 값을 낸다.

> **초판 오인용 정정.** 초판은 이것이 `CROSS-CUTTING.md` X-3 ⚠️가 말하는
> "무효화가 한 인스턴스에만 닿는다"의 위치라고 썼다. **다른 현상이다.**
> X-3 ⚠️는 **Redis가 없어서** 공유 티어 자체가 없는 경우이고,
> CA-3은 **Redis가 있어야** 성립한다. 배타적이다.

**수정**: `pttl` 반영은 **TTL 초과만 고친다.**
무효화 좀비는 `Math.min(remaining, …)`으로 안 없어진다 —
`latest_executives`가 방금 쓰였으면 `remaining`이 59분이라 여전히 60초를 준다.
**좀비를 없애려면 백필을 포기하거나(매번 Redis 조회) pub/sub 무효화가 필요하다.**

---

## CA-5 🟠 Redis 오류를 삼키고, 가장 흔한 장애를 제외한다

빈 `catch` 세 곳 — `:92-94`, `:109-111`, `:130-132`. 주석만 있고 로그가 없다.

읽기 실패(`:92`)는 폴백이 있으니 조용해도 된다.
**`:109`(쓰기 실패)와 `:130`(무효화 실패)는 다르다** —
무효화가 실패하면 낡은 값이 TTL 끝까지 사는데 **아무도 모른다.**
X-3이 세는 "무효화 부재"에 **"무효화 실패"가 조용히 합류한다.**

`:29`도 같은 형태다 — `} catch {`에 **오류 바인딩조차 없어서**
잘못된 `REDIS_URL`이면 `"Failed to initialize Redis"`만 남고 이유가 사라진다.

그리고 `:23-28`:

```ts
redis.on("error", (err: RedisError) => {
  if (err.code !== "ECONNREFUSED") { console.warn(">>> [Cache] Redis Error:", err); }
});
```

**`ECONNREFUSED`를 제외한다.** Redis 서버가 안 떠 있는 것 —
가장 흔하고 조치가 가장 명확한 장애 — 만 골라 침묵시킨다.
프로덕션에서 Redis가 죽으면 **로그에 아무것도 없이 1단으로 퇴화한다.**

`dev`일 때만 제외하거나 첫 발생 한 번만 로그해야 한다.

---

## CA-4 🟠 in-flight 중복 제거가 없다

`:75-99`는 "확인 → 없으면 fetcher"다. 진행 중인 fetcher를 기록하지 않는다.

콜드 캐시에 동시 요청 N개가 같은 키를 치면 **N번 전부 Notion을 부른다.**
`all_members`·`all_applications`처럼 여러 라우트가 공유하는 키에서 잘 발생한다.

Notion API는 초당 평균 3요청 제한이고 `notion/client.md` C-2가
**429 처리·재시도가 없다**고 지적했다 — 두 결함이 곱해지고,
그 결과가 CA-13으로 캐시에 못 박힌다. **셋이 한 사슬이다.**

```ts
const inflight = new Map<string, Promise<unknown>>();
const existing = inflight.get(key);
if (existing) return existing as Promise<T>;
const p = fetcher().finally(() => inflight.delete(key));
inflight.set(key, p);
```

---

## CA-10 🟠 무효화 API가 빈약하다

`invalidateCache(key: string)` 하나뿐이다. 없는 것:

**① 접두사·패턴 무효화.** 파라미터를 담은 키가 셋이다 —
`activities_${startDate}_${endDate}`, `user_activities_${memberId}`, `member_${email}`.
활동이 하나 추가되면 어느 날짜 범위 키가 낡았는지 **호출부가 알 수 없다.**
X-3에서 `activities_*` 무효화가 **0건**인 구조적 이유가 이것이다 —
API가 그것을 표현할 수단을 안 준다.

**② 배치.** 호출부는 `keys.forEach((key) => invalidateCache(key))`로 흩뿌린다
(`auth-guards.ts:109`, `:168`). `invalidateCache`가 `async`인데 `forEach`는
`await`할 수 없다(`auth-guards.md` AG-3).
**시그니처가 `(keys: string[])`이었다면 그 실수가 불가능했다.**

`invalidateCache(keys: string | string[])`와 `invalidatePrefix(prefix: string)` 둘이면
X-3의 미무효화 키 상당수가 표현 가능해진다.
(Redis 접두사 삭제는 `SCAN`+`UNLINK`. `KEYS`는 쓰지 말 것.)

---

## CA-17 🟡 키와 타입이 묶여 있지 않다

`:79` `local.data as T`, `:90` `data as T` — `Map<string, CacheEntry<unknown>>`에서
나온 값을 **검사 없이 단언**한다. `T`를 키가 아니라 **호출부가 정한다.**

같은 키를 두 호출부가 다른 `T`로 쓰면 조용히 잘못된 타입이 흐르고
컴파일러도 런타임도 아무 말이 없다. 지금 그런 호출부는 없다 —
**그러나 좁은 계약의 값어치가 바로 그 호출부를 막는 것이다.**

키를 상수 맵으로 두고 타입을 거기 붙이면(`CacheKeys.member(email): CacheKey<Member>`)
CA-10·CA-11의 처방과 같은 자리에서 해결된다.

---

## CA-7 🟡 정리가 미스 경로에서만, 5% 확률로 돈다

`:114-117` `if (Math.random() < 0.05) { pruneLocalCache(); }` — 위치가 `:99`의 fetcher **뒤**다.
즉 **캐시 히트에서는 절대 실행되지 않는다**(`:79` 로컬 히트, `:90` Redis 히트 둘 다 조기 반환).

**캐시가 잘 동작할수록 정리가 안 된다.** 다시 조회되지 않는 키
(`member_${탈퇴자}`, 지난 학기 `activities_*`)가 특히 오래 남는다.

fetcher가 **던지면 `:115`를 지나치지도 못한다** — `members.ts:61`,
`activities.ts:25`·`:67`·`:96`이 전부 던진다. 부하 상황에서 가장 자주 반복되는 경로가
정리를 한 번도 안 한다.

`MAX_LOCAL_SIZE = 1000` 검사도 같은 자리이므로 **상한이 상한이 아니다.**

람다 수명이 짧아 실제 누수로 이어지지 않을 수 있다.
**그것은 실행 환경의 성질이지 코드의 성질이 아니다.**
`localCache.set` 시점에 검사하는 것이 정확한 자리다 — 확률도 필요 없다.

---

## CA-8 🟡 축출이 anti-LRU다

`:53-60` `Array.from(localCache.keys()).slice(0, localCache.size - MAX_LOCAL_SIZE)`.

`Map`의 키 순서는 **삽입 순**이고, **기존 키에 `.set()`을 해도 순서가 바뀌지 않는다**:

```
node -e 'm=new Map();m.set("a",1);m.set("b",2);m.set("c",3);m.set("a",99);console.log([...m.keys()])'
→ [ 'a', 'b', 'c' ]
```

즉 **자주 갱신되는 키일수록 앞자리에 고정되고 가장 먼저 버려진다.**
FIFO보다 나쁘다 — 정확히 LRU의 반대다.

만료 임박순도 아니다(`entry.expiry`가 바로 위 루프에 있는데 안 쓴다).
`:47-51`이 이미 `expiry`를 순회하므로, 초과분을 `expiry` 오름차순으로 자르면
추가 자료구조 없이 "가장 빨리 죽을 것부터"가 된다.

---

## CA-16 🟡 상한이 바이트가 아니라 항목 수다

`MAX_LOCAL_SIZE = 1000`(`:40`)은 **엔트리 개수**를 센다.

캐시되는 것 중에는 큰 배열이 있다 — `all_members`(231행, `notion/schema.md` SC-9),
`all_activities`, `all_applications`. 1000개면 메모리 상한이 아니다.

CA-7이 "상한이 상한이 아니다"를 **시점**의 문제로 봤다면, 이것은 **단위**의 문제다.
개수로 재려면 항목 크기가 비슷해야 하는데, 이 캐시는 단건(`member_${email}`)과
전수 배열(`all_members`)을 같은 맵에 섞는다.

---

## CA-9 🟡 만료 기준 시각이 fetcher 실행 전이다

`:73` `const now = Date.now();`는 함수 **진입 시각**이고,
파일 안의 다른 `Date.now()`는 `:46`(`pruneLocalCache` 내부, `:116`에서만 도달)뿐이다.

```ts
const data = await fetcher();                              // 수백 ms ~ 수 초
localCache.set(key, { data, expiry: now + ttlMs });        // 오래된 now
```

Notion 전수 조회가 2초 걸리면 로컬 캐시 수명이 2초 짧아진다.
`:108`의 Redis `PX ttlMs`는 **호출 시점 기준**이므로 두 티어가 또 어긋난다.

`:102` 직전에 `Date.now()`를 다시 읽으면 된다. `:73`의 `now`는 읽기 검사용으로 남긴다.

---

## CA-12 🟡 `ttlMs = 0` 계약이 암묵적이다

호출부 두 곳이 `skipCache ? 0 : X`를 쓴다(`server/events.ts:23`, `:116`).
**`0`이 "캐시하지 마라"로 쓰이는데 이 파일 어디에도 그런 계약이 없다.**

동작은 우연히 맞다 — `:102`가 `expiry: now + 0`을 저장하고 `:78`의
`local.expiry > now`가 즉시 거짓이 된다. **만료된 쓰레기를 저장한다**는 뜻이지만.

Redis 쪽은 우연이 아니다. 실측:

```
redis-cli set k v PX 0     → ERR invalid expire time in 'set' command
redis-cli set k v PX -1    → ERR invalid expire time in 'set' command
redis-cli set k v PX 1000  → OK
```

지금은 `:105`의 `!skipCache`가 막아서 도달하지 않는다.
**CA-1을 고치는 순간 도달한다** — 그래서 두 지적을 함께 고쳐야 한다.

`ttlMs <= 0`이면 양 티어 모두 저장하지 않는 것을 계약으로 명시한다.

---

## CA-11 🟡 매직 넘버가 이 파일에 5개, 호출부에 12개

이 파일: `maxRetriesPerRequest: 1`(`:19`), `connectTimeout: 5000`(`:20`),
`MAX_LOCAL_SIZE = 1000`(`:40`), `Math.min(ttlMs, 60000)`(`:89`), `0.05`(`:115`).

호출부 TTL 12개는 `60000`×6 / `300000`×3 / `3600000`×2 / `30000`×1 — 네 값인데
**어느 것이 왜 그 값인지 코드에 없다.** `members.md` M-3, `events.md` SE-10이 같은 지적.

`CACHE_TTL = { SHORT: 60_000, MEDIUM: 300_000, LONG: 3_600_000 }`을 이 파일에서 export하면
호출부가 의도를 이름으로 표현하고 값 조정이 한 곳이 된다. CA-17의 키 상수와 같은 자리다.

---

## 지적하지 않은 것

- **`lazyConnect: true`**(`:21`) — 서버리스에 맞다. 첫 명령까지 연결하지 않는다
- **`redis`가 모듈 스코프인 것**(`:10`) — 인스턴스별 연결 재사용이 정석이다.
  `REDIS_URL` 미설정 시 `null`로 두고 분기하는 것도 맞다
- **`new Redis`를 `try/catch`로 감싼 것**(`:17-31`) — 잘못된 URL로 모듈 로드가 실패하면
  전 서버가 죽는다. 감싸는 **패턴**은 옳다. (오류 바인딩이 없는 것은 CA-5로 올렸다)
- **`maxRetriesPerRequest: 1`의 방향**(`:19`) — 캐시 계층에서 재시도를 줄이는 것은 옳다.
  실패하면 fetcher로 떨어지면 된다. (값의 근거 부재는 CA-11, 시간 제한 부재는 CA-15)

> 초판에는 여기에 **"Redis 값에 스키마 검증이 없는 것"**이 있었다.
> 삭제했다 — CA-14가 그 자리의 결함이다.

---

## 수정 순서

1. **CA-12 + CA-1** — `ttlMs <= 0`이면 양 티어 저장 안 함을 계약으로 명시하고,
   `:105`의 조건을 `:102`와 맞춘다. **순서를 뒤집으면 Redis 티어가 조용히 죽는다**
2. **CA-13** — `shouldCache` 또는 `CACHE_SKIP`. `X-10`(오류 규약)과 함께 하면
   fetcher가 삼키지 않고 던지게 되어 자연히 닫힌다
3. **CA-2 + CA-6** — 두 티어가 같은 형태를 내게 한다. 호출부 2곳의 제자리 `.sort()`도 함께
4. **CA-15** — `commandTimeout: 200`. 한 줄
5. **CA-14** — 키에 빌드 식별자 접두사. 배포가 곧 무효화가 된다
6. **CA-10 + CA-17 + CA-11** — 키 상수 모듈 하나로 세 지적이 닫힌다.
   AG-3의 `forEach` 실수가 **불가능**해진다
7. **CA-3** — 백필 포기 또는 pub/sub. `pttl`만으로는 좀비가 안 없어진다
8. **CA-5** — `:109`·`:130`에 로그, `:29`에 오류 바인딩, `ECONNREFUSED` 제외를 `dev` 한정으로
9. **CA-4** — in-flight 맵. `client.md` C-2와 함께
10. **CA-7 + CA-8 + CA-16 + CA-9** — 정리를 `set` 시점으로, 만료 임박순 축출,
    크기 기준 재검토, `now` 재측정

---

## 개정 이력

| 변경 | 내용 |
|---|---|
| **AC-1 인용 날조 철회** | 초판은 CA-1이 "새로고침 버튼이 안 듣는다"의 원인이라며 `activities.md` AC-1을 출처로 달았다. **AC-1은 그 주장을 명시적으로 철회했고**(`:147-152` "**틀렸다**") **그 철회 때문에 🔴→🟠로 강등**됐다(`:278`). 철회된 주장을 되살려 1순위 수정의 근거로 삼았다 |
| **CA-13 신설 🔴** | fetcher가 삼킨 실패·빈 결과가 캐시되고 Redis로 확산된다. 5곳. 429 한 번이 빈 배열을 60초 못 박는다. `withCache`에 "캐시하지 마라"를 표현할 수단이 없다 |
| **CA-1 집계 정정** | "12곳 중 10곳" → **7곳**. 3인자 호출 셋(`latest_executives`·`schema_`·`all_activities`)은 `options`가 `undefined`라 도달 불가. 그리고 `events.ts` 두 곳이 "TTL 0이라 상쇄"라 한 것도 **로컬 절반만** 맞다 — **Redis 절반은 동일하게 낡는다** |
| **CA-1 수정안 충돌 발견** | `:105`를 `if (redis)`로 고치면 `PX 0`에 도달해 CA-12가 발현하고 빈 catch가 삼킨다. 초판 수정 순서는 CA-1을 1번, CA-12를 8번에 뒀다 — **그 순서로 적용하면 Redis 티어가 조용히 죽는다** |
| **CA-2 오탐 철회** | `api/admin/seminar-requests/+server.ts:20`은 `:18-19`의 `.filter()`가 만든 **새 배열**을 정렬한다. 캐시와 무관하다. **인용한 줄 바로 위를 안 읽었다.** 3곳 → **2곳** |
| **CA-2 약한 근거 삭제** | `+page.server.ts:204`의 `semesters`는 `:197-203`에서 지역 생성된 배열이다. 캐시 오염을 암시한 것은 부적절 |
| **CA-3 오인용 정정** | X-3 ⚠️는 **Redis 부재**가 원인이고 CA-3은 **Redis 존재**가 전제다. 배타적인 두 현상을 같다고 썼다 |
| **CA-3 수정안 정정** | `pttl` 반영은 **TTL 초과만** 고친다. 무효화 좀비는 `Math.min(remaining,…)`으로 안 없어진다 — `latest_executives`는 `remaining`이 59분이라 여전히 60초를 준다 |
| **CA-14 · CA-15 · CA-16 · CA-17 신설** | 키 버전 부재(배포를 건너 살아남음) / `commandTimeout` 0건 / 상한 단위가 개수 / `as T` 무검증 단언 |
| **면죄부 철회** | "Redis 값에 스키마 검증이 없는 것"을 통과시킨 근거가 **쓰기 시점 보장**이었고, 게다가 그 검증기는 `utils.md` U-1이 무력하다고 밝힌 것이다. **스스로 무력하다고 적어둔 것을 근거로 삼았다.** → CA-14 |
| CA-8 강화 | `.set()`이 기존 키의 순서를 안 바꾸므로 **자주 갱신되는 키가 먼저 축출된다**. FIFO가 아니라 anti-LRU다 |
| CA-7 보강 | fetcher가 던지면 `:115`를 지나치지도 못한다. `:90` Redis 히트도 조기 반환에 추가 |
| CA-5 확대 | `:29`가 오류 바인딩 없는 `catch {`. 초판은 이것을 「지적하지 않은 것」에서 통과시켰다 |
| CA-11 계수 정정 | "4개" → **5개**(`:19` `:20` `:40` `:89` `:115`) |
| AD-14 인용 축소 | "전부 여기로 수렴한다"에서 AD-14 제외 — `getAllPrivateInfo` 무캐시는 이 파일이 원인이 아니다 |
