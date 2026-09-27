# `src/lib/server/mail.ts` (6줄)

**접두사 `LB15-`** · 메일 서비스 진입점(배럴). `mail/templates.ts` 전체와 `mail/client.ts`의 원시 발송 함수 둘을 재수출한다.

## LB15-1 🟡 배럴이 메일 계층의 절반만 덮어 import 경로가 둘로 갈렸다

5행은 `templates.ts`만 재수출하고 같은 역할의 `announcements.ts`는 빠져 있다(`LB14-3`).
그 결과 소비자가 둘로 나뉜다.

| 경로                                                | 소비자                                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 배럴 `$lib/server/mail`                             | `admin/+page.server.ts:46`, `signup/+page.server.ts:14`, `seminar/apply/+page.server.ts:14`, `study/apply/+page.server.ts:12`, `events/[id]/[type]/+page.server.ts:9` |
| 직접 `$lib/server/mail/announcements`               | `services/seminars.ts:11-15`, `settings/withdraw/+page.server.ts:7`                                                                                                   |
| 직접 `mail/{events,template-store,dispatch,client}` | `services/mail-admin.ts:5-18`                                                                                                                                         |

테스트의 목(mock) 대상도 따라 갈린다 — `signup-actions.test.ts:7`은 배럴을, `withdraw-actions.test.ts:8`은
`announcements`를, `seminars.test.ts:14` 등은 `dispatch`를 가로챈다. 어느 경로를 목으로 막아야 메일이 안 나가는지가
파일마다 다르다. 머리 주석 "Re-exports notification templates"는 템플릿이 아닌 어댑터를 가리킨다.

처방: 배럴이 발송 어댑터 전체를 재수출하거나(어댑터를 한 파일로 모으면 자연히 해결), 배럴을 없애고 직접 경로로 통일. **구조만.**

## LB15-2 🟡 가장 편한 import 경로가 규칙·옵트아웃·Bcc를 우회하는 원시 발송기를 내놓는다

6행 `getAdminAccessToken`, `dispatchEmail`을 배럴로 가져가는 소비자는 **없다**(유일한 사용처
`services/mail-admin.ts:18`은 `mail/client`를 직접 쓴다). 죽은 재수출이다.

죽은 것만이 문제가 아니다. `dispatchEmail`은 기본이 `To:` 목록이고(`client.ts:64-66`), 같은 파일 60-61행은
"전 회원 발송에는 Bcc가 **필수** — To: 목록은 모든 회원의 주소를 서로에게 노출한다"고 적는다. 서비스 진입점이
규칙 테이블·수신 동의·Bcc 결정을 모두 건너뛰는 함수를 권하는 모양이 된다. 좁은 공개면의 값어치는 **아직 없는**
잘못된 호출부를 막는 데 있다.

처방: 6행 삭제. **구조만**(현재 소비자 없음).

## 확인했고 지적하지 않은 것

- **`export *`(5행)** — 대상이 어댑터 함수뿐이라 의도치 않은 심볼이 새지 않는다. 문제는 대상의 범위(`LB15-1`)다

## 검증 (2026-09-28)

- LB15-1 — 확인 (소비자 표와 목 대상 `signup-actions.test.ts:7`·`withdraw-actions.test.ts:8`·`seminars.test.ts:14` 모두 일치. 배럴을 목으로 막는 테스트는 그 밖에 `dashboard-actions.test.ts:9`·`study-apply-actions.test.ts:10`·`seminar-request-actions.test.ts:10`이 더 있다)
- LB15-2 — 확인 (`getAdminAccessToken`·`dispatchEmail`의 배럴 경유 import 0건)
- 누락 점검: 6줄 전부. 새 지적 없음
