# `src/lib/server/services/asset-cleanup.ts` (49줄)

**접두사 `LB18-`** · 기록에서 떨어진 자산 키 중 **어느 기록도 더는 가리키지 않는 것**만 `assets` 버킷에서 지운다.
호출부는 `records-admin.ts:143,161,187,247,333`와 `seminar-requests.ts:100` — 전부 기록 쓰기가 끝난 **뒤**다.

## LB18-1 🟠 "아직 참조되는가"를 캐시된 읽기로, 삭제와 다른 시점에 판정한다

42행 `referencedAssetKeys()`는 `getTable` 넷(6-11행)으로 만든다. `getTable`은 `withCache`를 탄다 —
다른 인스턴스의 쓰기는 로컬 층에서 최대 15초, Redis 무효화가 소실되면 300초까지 보이지 않는다
(`data/tables.ts:31-37,168-176`, PRIORITY W-13). 판정 직후 45행에서 **되돌릴 수 없는** 삭제를 한다.

이 저장소는 결정 읽기의 규칙을 이미 적어 두었다:

- `data/tables.ts:120` "Always read the store directly (never the cache) so the version matches the doc" — 쓰기 결정
- `services/events.ts:152-157` 체크인 — "the cached copy may be up to 15s old", 그래서 흐름이 잠금 아래서 다시 읽는다

여기서는 되돌릴 수 없는 결정이 캐시 읽기에 기대고, 판정과 삭제 사이에 잠금도 없다.
28-30행이 약속하는 불변식("아직 누군가 가리키고 있으면 지우지 않는다")은 **읽은 시점의 그 인스턴스 캐시**에
대해서만 성립한다.

**현재 발현 경로는 확인되지 않았다** — 기존 키에 두 번째 참조가 생기는 유일한 길은 승인의 `posterKey`
상속이고, 그때 신청 행이 키를 계속 갖고 있으므로 신청 표가 낡아도 참조가 보인다. 그러나 그것은 호출부와
데이터의 성질이지 이 함수의 성질이 아니다(README 판정 기준). 참조를 만드는 두 번째 경로(키 재사용,
기록 간 사진 이동)가 생기는 순간 공개 세미나의 파일이 404가 된다. 회복은 운영자가 백업 미러에서
손으로 한다(`storage.ts:178-180`).

**처방(동작 변경 없음에 가까움)**: 참조 수집을 캐시 밖(`readDoc`)에서 한다. 완전한 해법은 삭제 대상 계산을
`flow_delete_seminar`처럼 흐름 안에 두는 것이다 — 흐름은 이미 `assets`를 돌려준다(`records-admin.ts:156-161`).

## ~~LB18-2 🟠 참조 열거가 `asset-access.ts`와 따로 있고, 여기서 빠뜨리면 쓰이는 파일을 지운다~~

> **검증 정정**: **철회 — `asset-access.ts` 문서 LB17-1의 중복이다.** 같은 두 파일·같은 네 표·다섯 필드·같은
> 비대칭 실패 방향("여기서 빠뜨리면 쓰이는 파일을 지운다")·같은 처방을 LB17-1이 이미 모두 적었다.
> 한 결함을 두 번 세지 않도록 LB17-1 하나로 둔다. 사실 관계(5-21행 ↔ `asset-access.ts:19-63`)는 맞다.

5-21행과 `asset-access.ts:19-63`이 같은 네 표·다섯 필드를 각자 훑는다
(`seminars.posterKey/materials/photos`, `seminar-requests.posterKey`, `studies.photos`, `gallery-dinner.photos`).

자산 필드가 늘면 두 곳을 함께 고쳐야 하는데 **실패 방향이 비대칭이다.** 판정 쪽에서 빠뜨리면 404(닫힘,
눈에 보임)지만 **여기서 빠뜨리면 새 필드가 가리키는 키가 "참조 없음"이 되어 삭제된다**(열림, 조용함).
두 파일 중 더 위험한 쪽이 이쪽이다. 두 파일 모두 서로를 언급하지 않는다.
필드 표 하나를 두고 둘이 공유하는 것이 맞다(`asset-access.ts` 문서 LB17-1과 같은 처방). 구조만.

## LB18-3 🟡 실패 경로의 주석과 로그가 사실과 다르다

- 32-34행 "남은 바이트는 **백업 미러가 있는** 회수 가능한 손해" — 미러는 **잘못 지운** 파일을 되살리는
  길이다(`storage.ts:178-180`). 지우지 **못한** 파일에는 되살릴 것이 없고 필요한 것은 재시도인데,
  그것을 하는 곳이 없다: 이 실패는 `console.error`로만 남고 크론 실패 집계(`cron-status.ts`)에도,
  staging 정리(`maintenance.ts` `cleanupStaging`, `pending/` 접두사만)에도 닿지 않는다.
  "삼키고 기록한다"는 결정(PRIORITY 부록 C)은 그대로 두되, **근거 문장**이 틀렸다
- 47행 로그가 `wanted` 전체를 찍는다. `removeAssets`가 실패했을 때 실제로 시도한 것은 `paths`(43행)이고,
  `wanted`에는 참조가 있어 **건너뛴** 키도 섞여 있다 — 진단자가 멀쩡한 파일을 실패 목록에서 보게 된다

## 확인했고 지적하지 않은 것

- **실패를 삼키는 것** — PRIORITY 부록 C의 결정("기록 편집은 이미 끝났고, 던지면 편집이 실패한 것처럼 보인다").
  재제기하지 않는다. LB18-3은 그 결정의 근거 문장만 다룬다
- **입력 정규화(39-40행)** — `null`/`undefined`/빈 문자열을 거르고 중복을 없앤다. 호출부가
  `replacedPoster: string | null`을 그대로 넘길 수 있게 한 것은 적절하다
- **클라이언트가 고른 키를 지우는 문제** — 호출부 `setFileArray`가 "이 기록이 가진 키만"으로 막는다
  (`records-admin.ts:176-181`). 이 함수는 받은 키 중 참조 없는 것만 지우므로 다른 기록의 파일을 지우지 못한다
- **CAS 재시도 중의 키 계산** — 호출부들이 `replacedPoster`를 시도마다 다시 계산한다
  (`seminar-requests.ts:86-90`, `records-admin.ts:123-127`). 이 함수는 커밋된 결과만 받는다
- **테스트** — 이 함수를 직접 부르는 테스트는 없고 `records-admin.test.ts` 등이 호출부를 통해 덮는다.
  공유 키 비삭제는 `records-admin.test.ts:266` 부근이 단언하고 PRIORITY 부록 C가 실측했다

## 검증 (2026-09-28)

- LB18-1 — 확인 (`getTable`은 `withCache`, `mutate`는 `readDoc` 직접 — `tables.ts:120,168-176`. 발현 경로도 다시 찾았다: 승인 후 신청 포스터 교체는 `seminar-requests.ts:85`의 `status !== "pending"` 직접 읽기 검사가 막으므로, 초판의 "현재 발현 경로 미확인"이 맞다. 결함은 함수의 성질이다)
- LB18-2 — 철회 (LB17-1의 중복)
- LB18-3 — 확인 (`storage.ts:178-180`은 미러를 "잘못 지운 것의 복구 경로"로 적는다. 47행은 `wanted`를 찍는다)
- 누락 점검: 호출부 여섯 곳(`records-admin.ts:143,161,187,247,333`, `seminar-requests.ts:100`)이 모두 커밋 뒤에 부르는 것, 흐름이 돌려주는 `assets`에 빈 문자열이 섞여도 39행이 거르는 것, 삭제된 세미나의 포스터를 닫힌 신청 행이 계속 참조하는 경우 `flow_delete_seminar`가 (가려진 세미나일 때) 신청의 `posterKey`를 비우고 그 키를 `assets`에 넣는 것(`atomic_flows.sql:263-272`)을 확인했다. 추가 지적 없음.
