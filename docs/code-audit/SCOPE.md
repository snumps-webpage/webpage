# 코드 감사 범위 — `main` 전체 파일 분류

> **성격**: 한시적 작업 문서. 감사 완료 후 결과만 남기고 삭제. [README](./README.md) 참조.

기준: 이 브랜치(`main` `76a5cda` + 죽은 코드 삭제 커밋) 추적 파일 **415개 / 51,427줄** 전수 분류.
경로는 전부 레포 루트 기준 상대경로.

---

## 0. 왜 범위를 다시 잡았는가

이전 `SCOPE.md`는 `899f971`(Notion 시대) 기준이었다. `main`이 `76a5cda`에서
`feat/fullstack-m1` 80커밋을 병합하면서 **감사 대상 트리 자체가 사라졌다**:

| 사라진 것                                   | 대체                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `src/lib/server/notion/**` (11개, 1,442줄)  | `src/lib/server/data/**` — Supabase + Zod 스키마 + Repository             |
| `src/lib/server/{admin,events,seminars}.ts` | `src/lib/server/services/**`                                              |
| 평평한 `src/routes/**`                      | 존 그룹 `(public)` `(applicant)` `(member)` `(admin)`                     |
| 없던 계층                                   | `src/lib/domain/**`, `src/lib/server/guards/**`, `src/lib/server/core/**` |

이전 감사에서 리뷰를 마친 17개 파일 중 **14개가 존재하지 않는다.**
살아남은 3개도 그대로가 아니다:

| 파일                               | 그때  | 지금  | 변경량                              |
| ---------------------------------- | ----- | ----- | ----------------------------------- |
| `src/lib/server/auth-guards.ts`    | 190줄 | 204줄 | +97 −83 — **사실상 재작성**         |
| `src/lib/server/mail/templates.ts` | 149줄 | 96줄  | +55 −108 — 디스패치 계층으로 분리됨 |
| `src/lib/server/cache.ts`          | 134줄 | 147줄 | +15 −2 — 거의 그대로                |

따라서 이전 리뷰 결과는 **`pre-migration/`으로 보존**하고, 감사는 새 트리 기준으로 다시 시작한다.
`cache.ts` 리뷰(CA-1~CA-17)만은 대상이 거의 변하지 않았으므로 **재검증 후 재사용 가능**하다.

## 1. 규모

|                     | 이전 (`899f971`) | 지금   | 배수 |
| ------------------- | ---------------- | ------ | ---- |
| 추적 파일           | 119              | 415    | ×3.5 |
| 감사 대상 코드 파일 | 85               | 301    | ×3.5 |
| 감사 대상 코드 줄   | 11,480           | 35,522 | ×3.1 |

> ⚠️ **방법론 재검토가 필요하다.** README의 "1 파일 = 1 문서 = 1 검증"을 그대로 적용하면
> 301회의 리뷰-검증 사이클이 된다. 이전 규모(85개)에서 17개를 처리하는 데 걸린 속도로는
> 끝나지 않는다. §9의 우선순위 안을 확정한 뒤 시작할 것.

---

## A. 검토 대상 — 코드 (301개 / 35,522줄)

검토 기준(이전과 동일):

- 코드 중복
- 함수 내부 하드코딩 파라미터 (매직 넘버·문자열)
- 확장을 고려하지 않은 구조
- 그 외 clean code 원칙 위반 (책임 분리, 명명, 함수 길이, 부수효과, 오류 처리)

순서는 **의존 방향을 따라 아래에서 위로** — 데이터 계층을 먼저 봐야 라우트의 문제가
자기 문제인지 계층 문제인지 구분된다.

### A-a 서버 — 데이터·코어 계층 (41개, 2,041줄)

Supabase 스토어, 테이블 추상화, Zod 스키마, ID·시간·학기 유틸. 이 계층의 계약이 위 전부를 규정한다.

| #   | 파일                                               | 줄  |
| --- | -------------------------------------------------- | --- |
| 1   | `src/lib/server/data/tables.ts`                    | 200 |
| 2   | `src/lib/server/data/storage.ts`                   | 182 |
| 3   | `src/lib/server/data/storage-memory.ts`            | 139 |
| 4   | `src/lib/server/data/admin-queue-views.ts`         | 126 |
| 5   | `src/lib/server/data/store.ts`                     | 111 |
| 6   | `src/lib/server/data/tables.test.ts`               | 110 |
| 7   | `src/lib/server/data/store-memory.ts`              | 86  |
| 8   | `src/lib/server/data/schemas/index.ts`             | 80  |
| 9   | `src/lib/server/data/views.ts`                     | 67  |
| 10  | `src/lib/server/data/audit.ts`                     | 51  |
| 11  | `src/lib/server/core/errors.ts`                    | 50  |
| 12  | `src/lib/server/core/semester.ts`                  | 50  |
| 13  | `src/lib/server/data/idempotency.test.ts`          | 49  |
| 14  | `src/lib/server/core/capabilities.ts`              | 46  |
| 15  | `src/lib/server/core/semester.test.ts`             | 45  |
| 16  | `src/lib/server/core/time.ts`                      | 44  |
| 17  | `src/lib/server/data/schemas/member.ts`            | 42  |
| 18  | `src/lib/server/data/repos.ts`                     | 41  |
| 19  | `src/lib/server/data/directory.ts`                 | 40  |
| 20  | `src/lib/server/data/idempotency.ts`               | 36  |
| 21  | `src/lib/server/data/schemas/common.ts`            | 31  |
| 22  | `src/lib/server/core/admin-bootstrap.ts`           | 30  |
| 23  | `src/lib/server/data/schemas/study.ts`             | 30  |
| 24  | `src/lib/server/data/schemas/mail-template.ts`     | 28  |
| 25  | `src/lib/server/data/schemas/seminar-request.ts`   | 27  |
| 26  | `src/lib/server/data/schemas/event.ts`             | 25  |
| 27  | `src/lib/server/data/supabase.ts`                  | 25  |
| 28  | `src/lib/server/data/schemas/mail-rule.ts`         | 24  |
| 29  | `src/lib/server/data/schemas/mail-variable.ts`     | 24  |
| 30  | `src/lib/server/data/schemas/private-info.ts`      | 22  |
| 31  | `src/lib/server/data/schemas/seminar.ts`           | 22  |
| 32  | `src/lib/server/data/schemas/application.ts`       | 21  |
| 33  | `src/lib/server/data/schemas/mail-rule-history.ts` | 21  |
| 34  | `src/lib/server/core/id.ts`                        | 17  |
| 35  | `src/lib/server/data/schemas/attendance-record.ts` | 17  |
| 36  | `src/lib/server/data/schemas/registration.ts`      | 17  |
| 37  | `src/lib/server/data/schemas/role-title.ts`        | 16  |
| 38  | `src/lib/server/data/schemas/study-request.ts`     | 16  |
| 39  | `src/lib/server/data/schemas/activity.ts`          | 13  |
| 40  | `src/lib/server/data/schemas/gallery-dinner.ts`    | 11  |
| 41  | `src/lib/server/core/strings.ts`                   | 9   |

### A-b 서버 — 서비스·가드·메일·공개 (60개, 11,339줄)

도메인 서비스, 존 가드, 메일 디스패치. 테스트 24개가 여기 몰려 있다.

| #   | 파일                                                  | 줄  |
| --- | ----------------------------------------------------- | --- |
| 1   | `src/lib/server/dev-study-fixtures.ts`                | 957 |
| 2   | `src/lib/server/services/mail-admin.ts`               | 641 |
| 3   | `src/lib/server/dev-admin-record-fixtures.ts`         | 555 |
| 4   | `src/lib/server/dev-admin-dashboard-fixtures.ts`      | 533 |
| 5   | `src/lib/server/dev-member-fixtures.ts`               | 511 |
| 6   | `src/lib/server/services/studies.ts`                  | 444 |
| 7   | `src/lib/server/services/events.ts`                   | 380 |
| 8   | `src/lib/server/guards/zone.test.ts`                  | 293 |
| 9   | `src/lib/server/services/records-admin.ts`            | 277 |
| 10  | `src/lib/server/dev-dashboard-fixtures.ts`            | 256 |
| 11  | `src/lib/server/mail/template-store.ts`               | 252 |
| 12  | `src/lib/server/dev-public-content-fixtures.ts`       | 246 |
| 13  | `src/lib/server/services/approvals.test.ts`           | 244 |
| 14  | `src/lib/server/services/studies.test.ts`             | 226 |
| 15  | `src/lib/server/dev-presenter-event-fixtures.ts`      | 219 |
| 16  | `src/lib/server/services/maintenance.ts`              | 212 |
| 17  | `src/lib/server/dev-admin-seminar-fixtures.ts`        | 211 |
| 18  | `src/lib/server/auth-guards.ts`                       | 204 |
| 19  | `src/lib/server/services/membership.ts`               | 204 |
| 20  | `src/lib/server/public/archive.ts`                    | 190 |
| 21  | `src/lib/server/public/archive.test.ts`               | 189 |
| 22  | `src/lib/server/dev-admin-dashboard-fixtures.test.ts` | 180 |
| 23  | `src/lib/server/services/members-admin.ts`            | 178 |
| 24  | `src/lib/server/services/seminar-requests.ts`         | 178 |
| 25  | `src/lib/server/mail/dispatch.test.ts`                | 168 |
| 26  | `src/lib/server/services/members-admin.test.ts`       | 166 |
| 27  | `src/lib/server/services/records-admin.test.ts`       | 159 |
| 28  | `src/lib/server/guards/zone.ts`                       | 155 |
| 29  | `src/lib/server/services/uploads.ts`                  | 152 |
| 30  | `src/lib/server/services/executives-admin.ts`         | 151 |
| 31  | `src/lib/server/cache.ts`                             | 147 |
| 32  | `src/lib/server/services/events.test.ts`              | 142 |
| 33  | `src/lib/server/mail/dispatch.ts`                     | 140 |
| 34  | `src/lib/server/services/withdrawal.test.ts`          | 137 |
| 35  | `src/lib/server/dev-study-fixtures.test.ts`           | 135 |
| 36  | `src/lib/server/services/participation.test.ts`       | 132 |
| 37  | `src/lib/server/services/maintenance.test.ts`         | 128 |
| 38  | `src/lib/server/guards/resolve-member.test.ts`        | 126 |
| 39  | `src/lib/server/dev-admin-record-fixtures.test.ts`    | 123 |
| 40  | `src/lib/server/mail/events.ts`                       | 120 |
| 41  | `src/lib/server/services/uploads.test.ts`             | 116 |
| 42  | `src/lib/server/services/signup-e2e.live.test.ts`     | 111 |
| 43  | `src/lib/server/mail/template-store.test.ts`          | 105 |
| 44  | `src/lib/server/services/withdrawal.ts`               | 104 |
| 45  | `src/lib/server/mail/client.ts`                       | 98  |
| 46  | `src/lib/server/mail/templates.ts`                    | 96  |
| 47  | `src/lib/server/guards/resolve-member.ts`             | 74  |
| 48  | `src/lib/server/mail/announcements.test.ts`           | 67  |
| 49  | `src/lib/server/dev-admin-seminar-fixtures.test.ts`   | 66  |
| 50  | `src/lib/server/dev-preview.ts`                       | 66  |
| 51  | `src/lib/server/upload-validation.ts`                 | 61  |
| 52  | `src/lib/server/dev-presenter-event-fixtures.test.ts` | 59  |
| 53  | `src/lib/server/dev-dashboard-fixtures.test.ts`       | 47  |
| 54  | `src/lib/server/mail/announcements.ts`                | 46  |
| 55  | `src/lib/server/route-policy.test.ts`                 | 40  |
| 56  | `src/lib/server/upload-validation.test.ts`            | 36  |
| 57  | `src/lib/server/attendance.ts`                        | 29  |
| 58  | `src/lib/server/account-preview.ts`                   | 28  |
| 59  | `src/lib/server/route-policy.ts`                      | 23  |
| 60  | `src/lib/server/mail.ts`                              | 6   |

### A-c 도메인 로직 (26개, 2,873줄)

순수 도메인 규칙. 테스트 12개가 붙어 있다 — 리뷰 시 테스트와 짝으로 볼 것.

| #   | 파일                                             | 줄  |
| --- | ------------------------------------------------ | --- |
| 1   | `src/lib/domain/studies.ts`                      | 371 |
| 2   | `src/lib/domain/members.ts`                      | 365 |
| 3   | `src/lib/domain/admin-seminars.ts`               | 213 |
| 4   | `src/lib/domain/seminars.ts`                     | 203 |
| 5   | `src/lib/domain/members.test.ts`                 | 185 |
| 6   | `src/lib/domain/admin-dashboard.ts`              | 181 |
| 7   | `src/lib/domain/admin-records.ts`                | 149 |
| 8   | `src/lib/domain/account.ts`                      | 144 |
| 9   | `src/lib/domain/public-content.ts`               | 143 |
| 10  | `src/lib/domain/dashboard.ts`                    | 100 |
| 11  | `src/lib/domain/studies.test.ts`                 | 92  |
| 12  | `src/lib/domain/seminars.test.ts`                | 87  |
| 13  | `src/lib/domain/attendance.ts`                   | 83  |
| 14  | `src/lib/domain/admin-seminars.test.ts`          | 79  |
| 15  | `src/lib/domain/api.ts`                          | 62  |
| 16  | `src/lib/domain/admin-records.test.ts`           | 60  |
| 17  | `src/lib/domain/dashboard.test.ts`               | 59  |
| 18  | `src/lib/domain/admin-dashboard.test.ts`         | 51  |
| 19  | `src/lib/domain/account.test.ts`                 | 49  |
| 20  | `src/lib/domain/public-content.test.ts`          | 38  |
| 21  | `src/lib/domain/attendance.test.ts`              | 37  |
| 22  | `src/lib/domain/executive-roster.ts`             | 34  |
| 23  | `src/lib/domain/membership-applications.test.ts` | 33  |
| 24  | `src/lib/domain/membership-applications.ts`      | 27  |
| 25  | `src/lib/domain/navigation.test.ts`              | 16  |
| 26  | `src/lib/domain/navigation.ts`                   | 12  |

### A-d 서버 진입점 (4개, 231줄)

| #   | 파일                  | 줄  |
| --- | --------------------- | --- |
| 1   | `src/hooks.server.ts` | 147 |
| 2   | `src/auth.ts`         | 40  |
| 3   | `src/app.d.ts`        | 27  |
| 4   | `src/app.html`        | 17  |

### A-e 공유 라이브러리 (12개, 839줄)

| #   | 파일                                        | 줄  |
| --- | ------------------------------------------- | --- |
| 1   | `src/lib/client/api.ts`                     | 172 |
| 2   | `src/lib/utils.ts`                          | 133 |
| 3   | `src/lib/public-navigation.ts`              | 114 |
| 4   | `src/lib/client/api.test.ts`                | 111 |
| 5   | `src/lib/constants.ts`                      | 63  |
| 6   | `src/lib/state.svelte.ts`                   | 57  |
| 7   | `src/lib/client/admin-queue-poller.ts`      | 50  |
| 8   | `src/lib/client/admin-queue-poller.test.ts` | 49  |
| 9   | `src/lib/theme.ts`                          | 34  |
| 10  | `src/lib/toasts.ts`                         | 28  |
| 11  | `src/lib/image.ts`                          | 27  |
| 12  | `src/lib/index.ts`                          | 1   |

### A-f 컴포넌트 (47개, 7,843줄)

| #   | 파일                                                           | 줄  |
| --- | -------------------------------------------------------------- | --- |
| 1   | `src/lib/components/admin/AdminSeminarRecordEditor.svelte`     | 605 |
| 2   | `src/lib/components/seminar/SeminarRequestForm.svelte`         | 595 |
| 3   | `src/lib/components/admin/AdminStudyRecordEditor.svelte`       | 543 |
| 4   | `src/lib/components/poster/SeminarPoster.svelte`               | 520 |
| 5   | `src/lib/components/admin/MemberRecordSections.svelte`         | 466 |
| 6   | `src/lib/components/study/StudySessionTimeline.svelte`         | 443 |
| 7   | `src/lib/components/admin/SeminarReviewCard.svelte`            | 332 |
| 8   | `src/lib/components/poster/SeminarPosterDownloadPanel.svelte`  | 295 |
| 9   | `src/lib/components/admin/SeminarScheduleDialog.svelte`        | 290 |
| 10  | `src/lib/components/admin/SeminarPublicationCard.svelte`       | 285 |
| 11  | `src/lib/components/study/StudyRosterPanel.svelte`             | 276 |
| 12  | `src/lib/components/poster/SpeakerSelector.svelte`             | 227 |
| 13  | `src/lib/components/dashboard/DashboardActivityLedger.svelte`  | 213 |
| 14  | `src/lib/components/study/StudyRequestForm.svelte`             | 213 |
| 15  | `src/lib/components/study/StudySessionCorrectionDialog.svelte` | 188 |
| 16  | `src/lib/components/admin/AdminEventLedger.svelte`             | 147 |
| 17  | `src/lib/components/study/StudyTransferPanel.svelte`           | 141 |
| 18  | `src/lib/components/admin/AdminAttendanceQueue.svelte`         | 135 |
| 19  | `src/lib/components/SymbolBackground.svelte`                   | 125 |
| 20  | `src/lib/components/admin/AdminReviewInbox.svelte`             | 124 |
| 21  | `src/lib/components/ExecutiveContacts.svelte`                  | 118 |
| 22  | `src/lib/components/poster/SeminarPosterSection.svelte`        | 100 |
| 23  | `src/lib/components/ActionButton.svelte`                       | 98  |
| 24  | `src/lib/components/admin/AdminApplicationQueue.svelte`        | 95  |
| 25  | `src/lib/components/admin/AdminDirectUploadForm.svelte`        | 94  |
| 26  | `src/lib/components/dashboard/DashboardWorkSummary.svelte`     | 94  |
| 27  | `src/lib/components/dashboard/DashboardProfilePanel.svelte`    | 88  |
| 28  | `src/lib/components/public/PublicIndexList.svelte`             | 77  |
| 29  | `src/lib/components/Toasts.svelte`                             | 76  |
| 30  | `src/lib/components/StatusBadge.svelte`                        | 73  |
| 31  | `src/lib/components/dashboard/GuestLanding.svelte`             | 73  |
| 32  | `src/lib/components/signup/SignupContactFields.svelte`         | 65  |
| 33  | `src/lib/components/SectionHeader.svelte`                      | 61  |
| 34  | `src/lib/components/poster/PosterUploadField.svelte`           | 59  |
| 35  | `src/lib/components/ManuscriptHeader.svelte`                   | 55  |
| 36  | `src/lib/components/CopyButton.svelte`                         | 51  |
| 37  | `src/lib/components/Skeleton.svelte`                           | 49  |
| 38  | `src/lib/components/signup/SignupConsentField.svelte`          | 49  |
| 39  | `src/lib/components/SuccessScreen.svelte`                      | 48  |
| 40  | `src/lib/components/Pagination.svelte`                         | 44  |
| 41  | `src/lib/components/public/PublicDirectoryNav.svelte`          | 43  |
| 42  | `src/lib/components/public/PublicDirectoryGrid.svelte`         | 38  |
| 43  | `src/lib/components/admin/ApplicationDetails.svelte`           | 37  |
| 44  | `src/lib/components/public/SourcePendingNotice.svelte`         | 36  |
| 45  | `src/lib/components/account/AccountSettingsNav.svelte`         | 20  |
| 46  | `src/lib/components/admin/AdminSectionNav.svelte`              | 20  |
| 47  | `src/lib/components/signup/SignupMetadataFields.svelte`        | 19  |

### A-g 라우트 — 서버 (load·action·endpoint) (62개, 3,540줄)

| #   | 파일                                                         | 줄  |
| --- | ------------------------------------------------------------ | --- |
| 1   | `src/routes/(public)/+page.server.ts`                        | 465 |
| 2   | `src/routes/(admin)/admin/+page.server.ts`                   | 345 |
| 3   | `src/routes/(admin)/admin/seminars/+page.server.ts`          | 183 |
| 4   | `src/routes/(admin)/admin/mail/+page.server.ts`              | 176 |
| 5   | `src/routes/(admin)/admin/members/[id]/+page.server.ts`      | 176 |
| 6   | `src/routes/(public)/archive/+layout.server.ts`              | 157 |
| 7   | `src/routes/(member)/study/[id]/manage/+page.server.ts`      | 149 |
| 8   | `src/routes/(admin)/admin/studies/+page.server.ts`           | 146 |
| 9   | `src/routes/(applicant)/signup/+page.server.ts`              | 110 |
| 10  | `src/routes/(member)/seminar/edit/[id]/+page.server.ts`      | 102 |
| 11  | `src/routes/(admin)/admin/gallery/+page.server.ts`           | 101 |
| 12  | `src/routes/(admin)/admin/activities/+page.server.ts`        | 95  |
| 13  | `src/routes/(member)/events/[id]/[type]/+page.server.ts`     | 80  |
| 14  | `src/routes/(member)/events/manage/+page.server.ts`          | 80  |
| 15  | `src/routes/(member)/seminar/apply/+page.server.ts`          | 71  |
| 16  | `src/routes/(member)/study/[id]/+page.server.ts`             | 67  |
| 17  | `src/routes/(member)/study/+page.server.ts`                  | 66  |
| 18  | `src/routes/(admin)/admin/executives/+page.server.ts`        | 65  |
| 19  | `src/routes/(member)/settings/notifications/+page.server.ts` | 65  |
| 20  | `src/routes/(member)/study/apply/+page.server.ts`            | 63  |
| 21  | `src/routes/(applicant)/signup/edit/+page.server.ts`         | 60  |
| 22  | `src/routes/(admin)/admin/events/new/+page.server.ts`        | 56  |
| 23  | `src/routes/(admin)/admin/events/connect/+page.server.ts`    | 46  |
| 24  | `src/routes/(member)/settings/withdraw/+page.server.ts`      | 46  |
| 25  | `src/routes/api/uploads/presign/+server.ts`                  | 42  |
| 26  | `src/routes/(public)/sitemap.xml/+server.ts`                 | 37  |
| 27  | `src/routes/(member)/study/[id]/attendance/+page.server.ts`  | 36  |
| 28  | `src/routes/(public)/archive/seminars/[id]/+page.server.ts`  | 36  |
| 29  | `src/routes/(admin)/admin/members/+page.server.ts`           | 32  |
| 30  | `src/routes/api/cron/sync-events/+server.ts`                 | 30  |
| 31  | `src/routes/(member)/+layout.server.ts`                      | 28  |
| 32  | `src/routes/api/cron/maintenance/+server.ts`                 | 27  |
| 33  | `src/routes/(public)/login/+page.server.ts`                  | 26  |
| 34  | `src/routes/api/admin/seminar-requests/+server.ts`           | 26  |
| 35  | `src/routes/api/admin/study-requests/+server.ts`             | 26  |
| 36  | `src/routes/+layout.server.ts`                               | 25  |
| 37  | `src/routes/api/admin/applications/+server.ts`               | 25  |
| 38  | `src/routes/api/health/+server.ts`                           | 25  |
| 39  | `src/routes/(applicant)/wait/+page.server.ts`                | 24  |
| 40  | `src/routes/(member)/withdraw/pending/+page.server.ts`       | 20  |
| 41  | `src/routes/(applicant)/+layout.server.ts`                   | 16  |
| 42  | `src/routes/(public)/members/+page.server.ts`                | 12  |
| 43  | `src/routes/(admin)/+layout.server.ts`                       | 10  |
| 44  | `src/routes/(public)/about/executives/+page.server.ts`       | 8   |
| 45  | `src/routes/(public)/archive/activities/+page.server.ts`     | 7   |
| 46  | `src/routes/(public)/archive/gallery/+page.server.ts`        | 7   |
| 47  | `src/routes/(public)/archive/projects/+page.server.ts`       | 7   |
| 48  | `src/routes/(public)/archive/seminars/+page.server.ts`       | 7   |
| 49  | `src/routes/(public)/archive/studies/+page.server.ts`        | 7   |
| 50  | `src/routes/(public)/robots.txt/+server.ts`                  | 7   |
| 51  | `src/routes/(applicant)/+layout.ts`                          | 4   |
| 52  | `src/routes/(admin)/+layout.ts`                              | 2   |
| 53  | `src/routes/(member)/+layout.ts`                             | 2   |
| 54  | `src/routes/(public)/about/+page.ts`                         | 1   |
| 55  | `src/routes/(public)/about/charter/+page.ts`                 | 1   |
| 56  | `src/routes/(public)/about/elections/+page.ts`               | 1   |
| 57  | `src/routes/(public)/about/finance/+page.ts`                 | 1   |
| 58  | `src/routes/(public)/about/press/+page.ts`                   | 1   |
| 59  | `src/routes/(public)/archive/discussions/+page.ts`           | 1   |
| 60  | `src/routes/(public)/archive/misc/+page.ts`                  | 1   |
| 61  | `src/routes/(public)/archive/misc/integration-bee/+page.ts`  | 1   |
| 62  | `src/routes/(public)/archive/problems/+page.ts`              | 1   |

### A-h 라우트 — 화면 (49개, 6,816줄)

| #   | 파일                                                              | 줄  |
| --- | ----------------------------------------------------------------- | --- |
| 1   | `src/routes/(admin)/admin/seminars/+page.svelte`                  | 525 |
| 2   | `src/routes/(member)/study/[id]/attendance/+page.svelte`          | 464 |
| 3   | `src/routes/(admin)/admin/studies/+page.svelte`                   | 366 |
| 4   | `src/routes/(member)/study/[id]/manage/+page.svelte`              | 366 |
| 5   | `src/routes/(admin)/admin/mail/+page.svelte`                      | 361 |
| 6   | `src/routes/(member)/study/+page.svelte`                          | 345 |
| 7   | `src/routes/(member)/events/manage/+page.svelte`                  | 308 |
| 8   | `src/routes/(admin)/admin/members/[id]/+page.svelte`              | 301 |
| 9   | `src/routes/(admin)/admin/events/connect/+page.svelte`            | 247 |
| 10  | `src/routes/(member)/study/[id]/+page.svelte`                     | 226 |
| 11  | `src/routes/(member)/study/apply/+page.svelte`                    | 225 |
| 12  | `src/routes/+layout.svelte`                                       | 219 |
| 13  | `src/routes/(admin)/admin/executives/+page.svelte`                | 208 |
| 14  | `src/routes/(admin)/admin/+page.svelte`                           | 168 |
| 15  | `src/routes/(member)/events/[id]/[type]/+page.svelte`             | 164 |
| 16  | `src/routes/(public)/members/+page.svelte`                        | 156 |
| 17  | `src/routes/(admin)/admin/members/+page.svelte`                   | 150 |
| 18  | `src/routes/+error.svelte`                                        | 140 |
| 19  | `src/routes/(member)/settings/withdraw/+page.svelte`              | 130 |
| 20  | `src/routes/(member)/settings/notifications/+page.svelte`         | 129 |
| 21  | `src/routes/(public)/archive/seminars/[id]/+page.svelte`          | 125 |
| 22  | `src/routes/(member)/seminar/edit/[id]/+page.svelte`              | 122 |
| 23  | `src/routes/(admin)/admin/events/new/+page.svelte`                | 119 |
| 24  | `src/routes/(public)/+page.svelte`                                | 116 |
| 25  | `src/routes/(public)/about/executives/+page.svelte`               | 107 |
| 26  | `src/routes/(applicant)/signup/edit/+page.svelte`                 | 103 |
| 27  | `src/routes/(admin)/admin/activities/+page.svelte`                | 93  |
| 28  | `src/routes/(applicant)/signup/+page.svelte`                      | 93  |
| 29  | `src/routes/(member)/withdraw/pending/+page.svelte`               | 88  |
| 30  | `src/routes/(public)/login/+page.svelte`                          | 84  |
| 31  | `src/routes/(admin)/admin/gallery/+page.svelte`                   | 76  |
| 32  | `src/routes/(applicant)/wait/+page.svelte`                        | 71  |
| 33  | `src/routes/(public)/archive/activities/+page.svelte`             | 63  |
| 34  | `src/routes/(public)/archive/gallery/+page.svelte`                | 61  |
| 35  | `src/routes/(member)/seminar/apply/+page.svelte`                  | 44  |
| 36  | `src/routes/(public)/archive/seminars/+page.svelte`               | 32  |
| 37  | `src/routes/(public)/about/+page.svelte`                          | 25  |
| 38  | `src/routes/(public)/archive/+page.svelte`                        | 25  |
| 39  | `src/routes/(public)/about/charter/+page.svelte`                  | 23  |
| 40  | `src/routes/(public)/archive/projects/+page.svelte`               | 23  |
| 41  | `src/routes/(public)/archive/studies/+page.svelte`                | 23  |
| 42  | `src/routes/(public)/about/charter/history/[period]/+page.svelte` | 20  |
| 43  | `src/routes/(public)/archive/misc/+page.svelte`                   | 17  |
| 44  | `src/routes/(public)/about/press/+page.svelte`                    | 15  |
| 45  | `src/routes/(public)/about/elections/+page.svelte`                | 10  |
| 46  | `src/routes/(public)/about/finance/+page.svelte`                  | 10  |
| 47  | `src/routes/(public)/archive/discussions/+page.svelte`            | 10  |
| 48  | `src/routes/(public)/archive/misc/integration-bee/+page.svelte`   | 10  |
| 49  | `src/routes/(public)/archive/problems/+page.svelte`               | 10  |

---

## A2. 검토 대상 — 스타일시트 (1개 / 1,948줄)

| #   | 파일                     | 줄   |
| --- | ------------------------ | ---- |
| 1   | `src/lib/manuscript.css` | 1948 |

**코드와 같은 기준을 쓸 수 없다.** 별도 기준으로 본다:
중복 선언, 하드코딩된 색상·간격(토큰 미사용), 명시도 충돌, 미사용 셀렉터,
다크모드 누락, 반응형 분기 중복.

1,948줄 단일 파일이라 **한 번에 리뷰하면 정확도가 떨어진다.** 섹션 단위로 쪼갤 것.

---

## A3. 검토 대상 — 빌드·배포 설정 (9개 / 242줄)

| #   | 파일                       | 줄  |
| --- | -------------------------- | --- |
| 1   | `package.json`             | 53  |
| 2   | `.env.example`             | 46  |
| 3   | `eslint.config.js`         | 39  |
| 4   | `svelte.config.js`         | 30  |
| 5   | `.github/workflows/ci.yml` | 27  |
| 6   | `tsconfig.json`            | 20  |
| 7   | `vitest.config.ts`         | 10  |
| 8   | `vite.config.ts`           | 9   |
| 9   | `vercel.json`              | 8   |

**clean code가 아니라 설정 적절성**을 본다. 코드 리뷰와 섞지 말 것.
이미 확인된 것은 `CROSS-CUTTING.md` XC-1·XC-2·XC-4 참조.

---

## A4. 검토 대상 — 운영·마이그레이션 스크립트 (50개 / 3,539줄)

**이전 범위에 없던 계층이다.** Notion→Supabase 이관과 운영 점검용으로 새로 들어왔다.

| #   | 파일                                            | 줄  |
| --- | ----------------------------------------------- | --- |
| 1   | `scripts/migration/20-export-tables.ts`         | 798 |
| 2   | `scripts/migration/lib.ts`                      | 469 |
| 3   | `scripts/seed-dev.ts`                           | 393 |
| 4   | `scripts/migration/10-assets.ts`                | 287 |
| 5   | `scripts/migration/30-verify.ts`                | 247 |
| 6   | `scripts/migration/00-dump.ts`                  | 97  |
| 7   | `scripts/ops/ops-t3-gate.mjs`                   | 78  |
| 8   | `scripts/ops/ops-setup.sh`                      | 71  |
| 9   | `scripts/ops/ops-inherit-legacy.mjs`            | 68  |
| 10  | `scripts/ops/ops-fix-legacy-refresh.mjs`        | 67  |
| 11  | `scripts/ops/ops-backfill-seminar-schedule.mjs` | 61  |
| 12  | `scripts/ops/ops-legacy-split.mjs`              | 60  |
| 13  | `scripts/ops/smoke-routes.sh`                   | 53  |
| 14  | `scripts/ops/make-cleanup-review.py`            | 49  |
| 15  | `scripts/ops/ops-verify-clean-names.mjs`        | 40  |
| 16  | `scripts/ops/route-unify.sh`                    | 39  |
| 17  | `scripts/ops/ops-vercel-env.sh`                 | 38  |
| 18  | `scripts/ops/ops-verify-conversion.mjs`         | 37  |
| 19  | `scripts/ops/ops-strip-probe-check.mjs`         | 36  |
| 20  | `scripts/ops/ops-clean-applications.mjs`        | 33  |
| 21  | `scripts/ops/ops-diag-signup.mjs`               | 33  |
| 22  | `scripts/ops/ops-vercel-env-preview.sh`         | 33  |
| 23  | `scripts/ops/ops-check-audit-trigger.mjs`       | 32  |
| 24  | `scripts/ops/ops-flow-probe.sh`                 | 30  |
| 25  | `scripts/ops/run-migration.sh`                  | 29  |
| 26  | `scripts/ops/ops-app-row.mjs`                   | 28  |
| 27  | `scripts/ops/ops-analyze-dash.mjs`              | 27  |
| 28  | `scripts/ops/ops-verify-strip-e2e.sh`           | 27  |
| 29  | `scripts/ops/ops-check-rls.mjs`                 | 26  |
| 30  | `scripts/ops/probe-admin-signup.sh`             | 19  |
| 31  | `scripts/ops/forge-session.mjs`                 | 18  |
| 32  | `scripts/ops/ops-env-auth.sh`                   | 17  |
| 33  | `scripts/ops/ops-leak-probe.sh`                 | 17  |
| 34  | `scripts/ops/ops-push-prod.sh`                  | 16  |
| 35  | `scripts/ops/ops-vercel-env-public.sh`          | 16  |
| 36  | `scripts/ops/ops-check-buckets.mjs`             | 15  |
| 37  | `scripts/ops/ops-vercel-preview-protection.sh`  | 14  |
| 38  | `scripts/ops/poll-guard-logs.sh`                | 14  |
| 39  | `scripts/ops/route-inventory.sh`                | 13  |
| 40  | `scripts/ops/ops-check-rls.sh`                  | 11  |
| 41  | `scripts/ops/run-signup-e2e.sh`                 | 11  |
| 42  | `scripts/ops/ops-create-dev.sh`                 | 10  |
| 43  | `scripts/ops/ops-diag-signup.sh`                | 9   |
| 44  | `scripts/ops/ops-legacy-split.sh`               | 9   |
| 45  | `scripts/ops/ops-check-buckets-prod.sh`         | 8   |
| 46  | `scripts/ops/ops-seed.sh`                       | 8   |
| 47  | `scripts/ops/ops-app-row.sh`                    | 7   |
| 48  | `scripts/ops/ops-check-audit-trigger.sh`        | 7   |
| 49  | `scripts/ops/ops-check-buckets.sh`              | 7   |
| 50  | `scripts/ops/ops-t3-gate.sh`                    | 7   |

**앱 코드와 기준이 다르다.** 일회성 스크립트에 확장성을 요구하지 않는다. 대신 볼 것:

- PII를 다루는 스크립트가 출력물을 어디에 쓰는가 (`scripts/migration/out/`은 gitignore됨 — 확인)
- 파괴적 동작에 가드가 있는가 (`--exclude`, dry-run, 확인 프롬프트)
- 이관이 끝난 스크립트가 남아 있을 이유가 있는가 → **C-12**

---

## A5. 검토 대상 — DB 마이그레이션 (1개 / 86줄)

| #   | 파일                                               | 줄  |
| --- | -------------------------------------------------- | --- |
| 1   | `supabase/migrations/20260901000000_documents.sql` | 86  |

스키마 정의다. 코드 기준이 아니라 **제약·인덱스·RLS** 관점으로 본다.

---

## B. 검토 제외 (49개)

이유가 분류마다 다르다.

### 문서 (31개) — 코드가 아님

| #   | 파일                                          | 줄  |
| --- | --------------------------------------------- | --- |
| 1   | `CHANGELOG.md`                                | 114 |
| 2   | `GEMINI.md`                                   | 110 |
| 3   | `README.md`                                   | 37  |
| 4   | `docs/ARCHITECTURE.md`                        | 40  |
| 5   | `docs/AUTH_VARS.md`                           | 19  |
| 6   | `docs/CACHE.md`                               | 42  |
| 7   | `docs/COMPONENTS.md`                          | 66  |
| 8   | `docs/DESIGN_BLUEPRINT.md`                    | 160 |
| 9   | `docs/FEATURES.md`                            | 33  |
| 10  | `docs/MAINTAINING_DOCS.md`                    | 60  |
| 11  | `docs/OPERATOR-TODO.md`                       | 232 |
| 12  | `docs/PERFORMANCE.md`                         | 60  |
| 13  | `docs/SETUP.md`                               | 96  |
| 14  | `docs/schema.md`                              | 79  |
| 15  | `docs/spec/API-SPEC.md`                       | 638 |
| 16  | `docs/spec/BACKEND-TASKS.md`                  | 155 |
| 17  | `docs/spec/CODE-REVIEW-M1-M6.md`              | 92  |
| 18  | `docs/spec/FRONTEND-DECISIONS.md`             | 400 |
| 19  | `docs/spec/FRONTEND-IMPLEMENTATION-STATUS.md` | 82  |
| 20  | `docs/spec/FUNCTIONAL-SPEC.md`                | 377 |
| 21  | `docs/spec/IMPLEMENTATION-SPEC.md`            | 670 |
| 22  | `docs/spec/SPEC-REVIEW.md`                    | 93  |
| 23  | `docs/spec/SUPABASE-MIGRATION-SPEC.md`        | 267 |
| 24  | `docs/spec/SUPABASE-SPEC-REVIEW.md`           | 40  |
| 25  | `experiment/README.md`                        | 40  |
| 26  | `experiment/palette-1.md`                     | 28  |
| 27  | `experiment/palette-2.md`                     | 27  |
| 28  | `experiment/palette-3.md`                     | 27  |
| 29  | `experiment/palette-4.md`                     | 27  |
| 30  | `scripts/migration/README.md`                 | 53  |
| 31  | `supabase/README.md`                          | 39  |

> 이관으로 내용이 낡았을 가능성이 큰 문서가 있다. 코드 감사 대상은 아니지만 **별도 갱신 대상**이다 → **C-13**

### 콘텐츠 (8개) — mdsvex 본문, 코드 아님

| #   | 파일                                      | 줄  |
| --- | ----------------------------------------- | --- |
| 1   | `src/content/about/charter.svx`           | 4   |
| 2   | `src/content/about/elections.svx`         | 3   |
| 3   | `src/content/about/finance.svx`           | 5   |
| 4   | `src/content/about/press.svx`             | 4   |
| 5   | `src/content/archive/discussions.svx`     | 3   |
| 6   | `src/content/archive/integration-bee.svx` | 3   |
| 7   | `src/content/archive/misc.svx`            | 5   |
| 8   | `src/content/archive/problems.svx`        | 3   |

### 에셋 (5개) — 바이너리·벡터

| #   | 파일                           | 줄  |
| --- | ------------------------------ | --- |
| 1   | `src/lib/assets/copy.svg`      | 0   |
| 2   | `src/lib/assets/favicon.svg`   | 25  |
| 3   | `src/lib/assets/instagram.svg` | 0   |
| 4   | `src/lib/assets/menu.svg`      | 0   |
| 5   | `static/posters/favicon.svg`   | 25  |

### 도구 설정·산출물 (5개)

| #   | 파일                  | 줄   |
| --- | --------------------- | ---- |
| 1   | `.gitignore`          | 64   |
| 2   | `.npmrc`              | 1    |
| 3   | `.vercelignore`       | 5    |
| 4   | `package-lock.json`   | 4459 |
| 5   | `pnpm-workspace.yaml` | 2    |

> `package-lock.json`은 제외 분류지만 **존재 자체가 문제다** → `CROSS-CUTTING.md` XC-3

---

## C. 사용자 확인 필요

### 이전 C 항목 재확인 (`main` 기준)

| #    | 대상                              | 이전 결정 | 지금 상태                                                                                                                                                        |
| ---- | --------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1  | 실험 코드                         | 삭제      | ✅ 이 브랜치에서 처리                                                                                                                                            |
| C-2  | `routes/notion/**`                | 삭제      | ✅ 이관이 이미 제거                                                                                                                                              |
| C-3  | `static/posters/*.html` (1,251줄) | 유지      | ⚠️ **여전히 `src`에서 참조 없음.** 포스터는 이제 세미나 레코드가 `posterKey`로 소유한다 — 정적 프로토타입과 구현 사이 드리프트 폭이 이전보다 커졌다. 재확인 필요 |
| C-4  | Docker 3종                        | 삭제      | ✅ 이 브랜치에서 처리                                                                                                                                            |
| C-5  | `routes/diag`                     | 삭제      | ✅ 이관이 이미 제거                                                                                                                                              |
| C-6  | png 410 스텁                      | 유지      | ✅ 이관이 제거함 — 항목 소멸                                                                                                                                     |
| C-7  | `test-results/`                   | 삭제      | ✅ 이 브랜치에서 처리 (gitignore 추가)                                                                                                                           |
| C-8  | `.env.example`                    | 유지      | ⚠️ **내용이 어긋났다** — 아래                                                                                                                                    |
| C-9  | `robots.txt`                      | 유지      | ✅ 해결 — 라우트로 이동하고 `Allow: /`로 열렸다                                                                                                                  |
| C-10 | `vercel.json` cron                | 유지      | ⚠️ **주기가 바뀌었고 짝이 사라졌다** — `CROSS-CUTTING.md` XC-4                                                                                                   |
| C-11 | `GEMINI.md`                       | 유지      | ⚠️ 이관 이후 현행성 미확인. 110줄                                                                                                                                |

### 신규 확인 항목

| #    | 대상                                                    | 확인해야 할 것                      | 근거                                                                                                                                                           |
| ---- | ------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-12 | `scripts/migration/**`                                  | **이관 완료 후에도 유지할 것인가?** | Notion→Supabase 일회성 이관 스크립트다. 남길 거면 A4 리뷰 대상, 지울 거면 A4에서 상당량이 빠진다                                                               |
| C-13 | `docs/**` 31개 중 이관 전 작성분                        | **어느 문서가 낡았는가?**           | 데이터 계층·라우트 구조가 전부 바뀌었다. 코드 감사와 별개로 문서 감사가 필요한지 판단                                                                          |
| C-14 | `.env.example` 대 실제 사용 변수                        | **어느 쪽을 맞출 것인가?**          | 예시에만 있고 코드가 안 읽는 것: `NOTION_API_KEY`, `NOTION_DATABASE_ID`. 코드가 읽는데 예시에 없는 것: `ADMINS_EMAILS`(부트스트랩 관문), `ADMIN_REFRESH_TOKEN` |
| C-15 | `src/lib/client/**`(4개)·`src/lib/domain/**`(26개) 경계 | **분리 기준이 무엇인가?**           | 새로 생긴 계층이다. 리뷰 전에 의도된 경계를 알아야 "경계 위반"을 판정할 수 있다                                                                                |

---

## 진행 방식

```
1) C-12~C-15 확정 → A4·B 규모 조정
2) A를 의존 순서대로: A-a → A-b → A-c → A-d → A-e → A-f → A-g → A-h
3) 파일 1개당:
     a. 리뷰 → docs/code-audit/files/<경로>.md
     b. 검증 에이전트 dispatch — 지적이 옳은지, 과도하지 않은지, 빠진 게 없는지
     c. 에이전트 지적을 직접 재확인 후 반영
4) A2 스타일시트는 섹션 단위로 별도 진행
5) A3·A5 설정은 마지막에 (앞 결과가 설정 판단에 영향)
```

### §9 우선순위 — 확정 필요

301개 전수는 현실적이지 않다. 세 안 중 하나를 고를 것:

| 안                       | 범위                                  | 대가                                                       |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------- |
| **가. 전수**             | 301개 전부                            | 원칙 유지. 이전 속도라면 끝나지 않는다                     |
| **나. 계층 우선** (권장) | A-a·A-b·A-c = 127개 / 16,253줄        | 계약이 정해지는 곳만 본다. 라우트·컴포넌트의 중복은 놓친다 |
| **다. 위험 우선**        | 가드·인증·데이터 접근·PII 취급 파일만 | 가장 빠르다. clean code 목적은 거의 포기                   |

**나**를 권한다 — 아래 계층을 먼저 봐야 위 계층 지적이 자기 문제인지 계층 문제인지 갈린다는
원래 순서 논리가, 규모가 커질수록 더 중요해진다.

**파일 1개 = 문서 1개 = 검증 1회.** 묶어서 처리하지 않는다.
