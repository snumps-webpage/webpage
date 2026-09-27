# `src/lib/server/data/pglite-bootstrap.ts` (24줄)

**접두사 `LA33-`** · 빈 PGlite를 앱 DB로 만드는 유일한 경로 — `storage` 스키마 대역을 만들고 마이그레이션을 이름순으로 적용. `store-memory.ts`(런타임)와 vitest 스냅숏 셋업이 공유.

## LA33-1 🟡 "유일한 경로"가 순서만 소유하고, 어떤 파일이 마이그레이션인지는 호출자 둘이 따로 정한다

2-4행은 이 모듈을 "the one way"라 부른다. 그러나 이 함수는 `files`를 받아 정렬만 한다(22).
**마이그레이션 디렉터리 위치와 선별 규칙**은 두 호출자가 각자 적는다:

| 호출자                           | 발견 방식                                                            | 키 모양                     |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------- |
| `store-memory.ts:19-23,55`       | `import.meta.glob("/supabase/migrations/*.sql")`                     | `/supabase/migrations/…sql` |
| `pglite-snapshot.setup.ts:15-22` | `readdirSync("supabase/migrations")` + `endsWith(".sql")` + `sort()` | `supabase/migrations/…sql`  |

마이그레이션 디렉터리를 옮기거나, 그 디렉터리에 적용하면 안 되는 `.sql`이 생기면(예: 수동 복구 스크립트)
두 곳을 같이 고쳐야 하고, 한쪽만 고치면 **테스트 스냅숏과 런타임 memory 백엔드가 다른 스키마**를 갖는다 —
이 모듈이 막으려던 바로 그 드리프트다.

또 3행은 "file-name order"라 적지만 22행은 **넘겨받은 문자열 전체**로 정렬한다. 두 호출자가 모두 한 디렉터리의
경로를 넘기므로 지금은 같은 결과지만, 계약은 파일 이름이 아니라 경로 순이다. 스냅숏 셋업의 `.sort()`(20)는 22행과 중복이다.

**고침**: 이 모듈이 `MIGRATIONS_DIR`와 `isMigration(name)`을 내보내고, 정렬 키를 `path.basename`으로 한다.
구조만 바뀐다(`import.meta.glob`은 리터럴 패턴이 필요하므로 런타임 쪽은 상수를 주석으로 교차 참조하는 정도가 한계일 수 있다).

## LA33-2 🟡 `STORAGE_STUB`은 내보낼 이유가 없다

9행 `export const STORAGE_STUB` — 이 파일 밖에서 import하는 곳이 없다(`grep` 0건). 내보내면 "다른 곳에서도 쓰는
계약"으로 읽힌다. 구조만 바뀐다.

## 확인했고 지적하지 않은 것

- **대역 스키마의 열(`id, name, public`)** — 마이그레이션이 `storage.buckets`에 쓰는 열과 정확히 같다
  (`20260901000000_documents.sql:81`). 마이그레이션이 다른 열을 쓰게 되면 memory 백엔드가 즉시 실패하므로
  조용한 드리프트가 아니다
- **`await import("@electric-sql/pglite")`(19)** — 동적 import이지만 이 모듈은 런타임 번들에도 들어가고 PGlite는
  memory 백엔드에서만 필요하다. 운영 번들 경로에서 무거운 WASM을 늦게 불러오려는 의도로 읽힌다 — `X-9`류(정적 의존의
  동적 import)와 달리 이유가 있다
- **마이그레이션을 `exec`로 한 파일씩 적용(22)** — 파일 하나가 실패하면 즉시 던진다. 반쯤 적용된 DB를 조용히 쓰지 않는다

## 검증 (2026-09-28)

- LA33-1 — 확인(`store-memory.ts:19-23,55`의 `import.meta.glob`, `pglite-snapshot.setup.ts:17-21`의 `readdirSync`+`.sort()`)
- LA33-2 — 확인(`STORAGE_STUB` 외부 import 0건)
- 누락 점검: 대역 열과 `documents.sql`의 `storage.buckets` INSERT 열 일치, 파일별 `exec` 실패 전파를 확인. 추가 없음.
