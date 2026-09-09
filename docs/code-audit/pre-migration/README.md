# 이관 이전 감사 결과 (보존)

> **읽기 전에**: 이 디렉터리의 문서는 **`899f971`(Notion 시대) 코드베이스**를 대상으로 한다.
> `main`이 `76a5cda`에서 `feat/fullstack-m1` 80커밋을 병합하면서 그 트리는 사라졌다.
> **현행 코드에 그대로 적용하지 말 것.**

## 무엇이 남아 있는가

|                    | 내용                                                          |
| ------------------ | ------------------------------------------------------------- |
| `CROSS-CUTTING.md` | 교차 발견 `X-1`~`X-10`                                        |
| `files/`           | 파일별 리뷰 17개 — 지적 총 84건(A-a 계층) + 도메인 계층 6파일 |

## 대상 파일의 현재 상태

리뷰를 마친 17개 중 **14개가 존재하지 않는다.**

| 리뷰 문서                                 | 대상 파일                          | 현재                                              |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `files/src/lib/server/notion/*.md` (11개) | `src/lib/server/notion/**`         | ❌ 삭제 — `src/lib/server/data/**`로 대체         |
| `files/src/lib/server/notion.md`          | `src/lib/server/notion.ts`         | ❌ 삭제                                           |
| `files/src/lib/server/admin.md`           | `src/lib/server/admin.ts`          | ❌ 삭제 — `services/members-admin.ts` 등으로 분해 |
| `files/src/lib/server/events.md`          | `src/lib/server/events.ts`         | ❌ 삭제                                           |
| `files/src/lib/server/seminars.md`        | `src/lib/server/seminars.ts`       | ❌ 삭제 — `services/seminar-requests.ts`          |
| `files/src/lib/server/auth-guards.md`     | `src/lib/server/auth-guards.ts`    | ⚠️ 존재하나 +97 −83 — 사실상 재작성               |
| `files/src/lib/server/mail/templates.md`  | `src/lib/server/mail/templates.ts` | ⚠️ 149 → 96줄. 디스패치 계층으로 분리             |
| `files/src/lib/server/cache.md`           | `src/lib/server/cache.ts`          | ✅ +15 −2 — 거의 그대로                           |

## 어떻게 쓰는가

1. **`cache.md`(CA-1~CA-17)** — 대상이 거의 안 변했다. **재검증 후 새 감사로 승격 가능.**
2. **`X-9`(정적 의존의 동적 import), `X-10`(계층별 오류 처리 규약 부재)** — 파일이 아니라
   **습관**에 대한 지적이다. 새 코드베이스에서 반복되는지 확인할 가치가 있다.
   현행 `CROSS-CUTTING.md` 말미의 "진행 중" 표에 미검증 관찰로 옮겨 두었다.
3. 나머지는 **역사 기록**이다. 같은 결함이 새 구조에서 어떤 모습으로 재등장하는지
   대조하는 용도 외에는 쓰지 않는다.

## `X-1`이 남긴 것

이 감사의 가장 큰 발견은 `X-1` — **`main`이 빌드되지 않았다**(`zod` 미설치)는 사실과,
`svelte-check`가 그것을 40개 오류로 잡고 있었는데 **감사자가 숫자만 보고 내용을 읽지 않았다**는
자기 지적이었다. 이관이 결함 자체는 해결했다(`zod`가 정식 의존성이 됨, `svelte-check` 0 errors).

**교훈은 해결되지 않았다.** 기준선은 개수가 아니라 목록이어야 한다.
현행 `CROSS-CUTTING.md`의 수치는 전부 실제 출력을 읽고 적었다.
