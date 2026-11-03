<script lang="ts">
  import StudySessionEmpty from "./StudySessionEmpty.svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import {
    MANUSCRIPT,
    STUDY_LINK_TYPES,
    isStudyLinkType,
  } from "$lib/constants";
  import {
    filterStudyActivityGroups,
    matchesActivitySearch,
  } from "$lib/domain/admin-activity-groups";
  import { pickerChoice } from "$lib/domain/recorded-people";

  let { data, form } = $props();
  let query = $state("");
  type ActivityRow = (typeof data.activities)[number];
  const dateOf = (activity: ActivityRow) => activity.date.start.slice(0, 10);
  const activities = $derived(
    (data.ungroupedActivities ?? data.activities).filter(
      (activity: ActivityRow) => matchesActivitySearch(activity, query),
    ),
  );
  const studyGroups = $derived(
    filterStudyActivityGroups(data.studyGroups ?? [], query),
  );
  const eventStatus: Record<string, string> = {
    draft: "준비",
    active: "진행",
    expired: "종료",
    cancelled: "취소",
  };
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  /** The date-only picker feeds the action's datetime `start` field. */
  function dateToStart(originalDate?: string) {
    return (event: FormDataEvent) => {
      const picked = event.formData.get("date") as string | null;
      event.formData.delete("date");
      if (picked && picked !== originalDate)
        event.formData.set("start", `${picked}T00:00`);
    };
  }
  const operationLabel: Record<string, string> = {
    activityCreated: "활동 기록을 생성했습니다.",
    activityUpdated: "활동 기록을 수정했습니다.",
    attendeesReplaced: "참석자 명단을 관리자 권한으로 교체했습니다.",
    activityDeleted: "활동 기록을 삭제했습니다.",
    studyLinked: "활동의 스터디 연결을 저장했습니다.",
  };
  /** The card whose ?/update was refused — it opens with what was typed. */
  const refusedId = $derived(
    form?.error && form.id && form.values ? form.id : null,
  );
  /**
   * 기본 정보 칸에 채울 값 — 그 활동의 수정이 거절됐으면 **제출한 값**, 아니면
   * 저장된 값(D-000098, 세미나 편집기와 같은 규칙). 보내지 않은 칸(잠긴 종류,
   * 바꾸지 않은 날짜)은 저장값이다.
   */
  function shownFor(activity: ActivityRow) {
    const v = (refusedId === activity.id ? form?.values : undefined) as
      Partial<Record<"title" | "type" | "start", string>> | undefined;
    return {
      title: v?.title ?? activity.title,
      type: v?.type || activity.type,
      date: v?.start ? v.start.slice(0, 10) : dateOf(activity),
    };
  }
  const studyLabel = (study: (typeof data.studies)[number]) =>
    `${study.semester} · ${study.title}`;
  const linkedStudy = (activity: ActivityRow) =>
    data.studies.find((study) => study.id === activity.studyId);
  /**
   * 종류 칸의 선택지(D-000138). 스터디 회차 활동은 잠긴 칸에 지금 종류를, 그 밖의
   * 연결 활동은 '스터디'·'회식'만 — 지금 종류가 그 둘이 아니면(옛 데이터) 그 종류를
   * 맨 앞에 두어 저장된 대로 보이되, 저장하려면 둘 중 하나를 골라야 한다(서버가 거부).
   */
  function typeChoices(activity: ActivityRow): readonly string[] {
    // 종류가 '스터디'가 아닌 회차 활동(옛 데이터)은 '스터디'로 되돌릴 수만 있다(D-000237)
    if (activity.sessionStudyId && activity.type !== "스터디")
      return [activity.type, "스터디"];
    if (activity.sessionStudyId || activity.studyId === null)
      return data.activityTypes;
    return isStudyLinkType(activity.type)
      ? STUDY_LINK_TYPES
      : [activity.type, ...STUDY_LINK_TYPES];
  }
  /** A study-session activity shows its session's study, read-only (D-000088). */
  function sessionStudyLabel(studyId: string) {
    const study = data.studies.find((s) => s.id === studyId);
    return study ? studyLabel(study) : "알 수 없는 스터디";
  }
</script>

<svelte:head><title>활동 기록 관리 · SNUMPS 관리자</title></svelte:head>

{#snippet activityCard(activity: ActivityRow)}
  {@const shown = shownFor(activity)}
  <!-- 수정이 거절되면 그 카드를 펼친 채로 — 입력한 값이 다시 채워져 있다(D-000098) -->
  <details class="record-card" open={refusedId === activity.id}>
    <summary
      ><div>
        <span>{dateOf(activity)} · {activity.type}</span><strong
          >{activity.title}</strong
        >
      </div>
      <small
        >{activity.attendeeIds.length}명 참석 · 이벤트 {activity.linkedEventIds
          .length}개{#if activity.studyId}
          · 스터디 {linkedStudy(activity)?.title ?? "알 수 없음"}{/if}</small
      ></summary
    >
    <div class="record-body">
      <form
        method="POST"
        action="?/update"
        class="record-form"
        onformdata={dateToStart(dateOf(activity))}
      >
        <input type="hidden" name="id" value={activity.id} /><label
          ><span class="paper-label">활동명</span><input
            name="title"
            value={shown.title}
          /></label
        ><label
          ><span class="paper-label">유형</span><select
            name="type"
            disabled={activity.sessionStudyId !== null &&
              activity.type === "스터디"}
            >{#each typeChoices(activity) as type (type)}<option
                value={type}
                selected={type === shown.type}>{type}</option
              >{/each}</select
          >{#if activity.sessionStudyId !== null && activity.type !== "스터디"}<small
              class="field-note"
              >스터디 회차 활동은 종류를 '스터디'로만 되돌릴 수 있습니다.</small
            >{:else if activity.sessionStudyId !== null}<!-- 회차 활동은 종류를 잠근다 — 비활성 칸은 제출되지 않아 서버가 종류를 그대로 둔다(D-000129·138) --><small
              class="field-note"
              >스터디 회차 활동은 종류를 바꿀 수 없습니다.</small
            >{:else if activity.studyId !== null}<small class="field-note"
              >스터디에 연결된 활동은 종류를 '스터디'나 '회식'으로만 바꿀 수
              있습니다. 다른 종류로 바꾸려면 먼저 스터디 연결을 해제해 주세요.</small
            >{/if}</label
        ><label
          ><span class="paper-label">날짜</span><input
            type="date"
            name="date"
            value={shown.date}
          /></label
        ><button class="paper-btn" type="submit">기본 정보 수정</button>
      </form>
      {#if activity.sessionStudyId}
        <p class="study-link-fixed">
          <span class="paper-label">연결 스터디</span>
          {sessionStudyLabel(activity.sessionStudyId)}
          <small
            >스터디 회차 활동은 그 회차의 스터디에 고정되어 있어 연결을 바꾸거나
            해제할 수 없습니다.</small
          >
        </p>
      {:else if isStudyLinkType(activity.type)}
        <form method="POST" action="?/setStudy" class="study-link-form">
          <input type="hidden" name="id" value={activity.id} />
          <label
            ><span class="paper-label">연결 스터디</span><select name="studyId"
              ><option value="" selected={!activity.studyId}>연결 안 함</option
              >{#if activity.studyId && !linkedStudy(activity)}<option
                  value={activity.studyId}
                  selected>알 수 없는 스터디</option
                >{/if}{#each data.studies as study (study.id)}<option
                  value={study.id}
                  selected={study.id === activity.studyId}
                  >{studyLabel(study)}</option
                >{/each}</select
            ></label
          >
          <button class="paper-btn" type="submit">스터디 연결 저장</button>
        </form>
      {/if}
      <form
        method="POST"
        action="?/setAttendees"
        class="attendee-form"
        onsubmit={(event) => {
          if (!confirm("현재 참석자 명단을 선택한 회원으로 전체 교체할까요?"))
            event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={activity.id} />
        <fieldset>
          <legend>참석자 전체 교체</legend>
          <div class="member-picker">
            {#each activity.formerAttendees as person (person.id)}<label
                ><input
                  type="checkbox"
                  name="attendeeIds"
                  value={person.id}
                  checked
                /><span>{person.name}<small>이전 회원</small></span></label
              >{/each}
            {#each data.members as member (member.id)}{@const choice =
                pickerChoice(member, activity.attendeeIds)}<label
                ><input
                  type="checkbox"
                  name="attendeeIds"
                  value={choice.value}
                  checked={choice.checked}
                /><span>{member.name}<small>{member.department}</small></span
                ></label
              >{/each}
          </div>
        </fieldset>
        <button class="paper-btn" type="submit">참석자 교체</button>
      </form>
      <form
        method="POST"
        action="?/delete"
        class="delete-row"
        onsubmit={(event) => {
          if (!confirm(`'${activity.title}' 활동 기록을 삭제할까요?`))
            event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={activity.id} /><span
          >{activity.linkedEventIds.length
            ? "연결 이벤트가 있어 현재 삭제 불가"
            : "삭제 후 복구는 S3 버전 이력에서만 가능"}</span
        ><button
          class="paper-btn small"
          type="submit"
          disabled={activity.linkedEventIds.length > 0}>기록 삭제</button
        >
      </form>
    </div>
  </details>
{/snippet}

<article class="paper-document activity-admin-paper">
  <ManuscriptHeader
    title="활동 기록 관리"
    subtitle="Activity Record Editor"
    figure={MANUSCRIPT.FIGURES.ADMIN_ACTIVITIES}
  />
  <AdminSectionNav />
  <p class="scope-note">
    이 화면의 참석자 지정은 관리자 전권 교체 예외입니다. 발표자·주최자 출석
    저장의 병합 규칙과 다릅니다.
  </p>

  {#if form?.success && form.operation}<p
      class="paper-status-note success"
      role="status"
    >
      {operationLabel[form.operation as string]}
    </p>{/if}
  {#if form?.error === "CONFLICT"}<p
      class="paper-status-note error"
      role="alert"
    >
      {form.message ??
        "연결된 이벤트가 있어 삭제할 수 없습니다. 먼저 이벤트와 출석 큐를 정리해 주세요."}
    </p>{/if}
  {#if form?.error === "VALIDATION_FAILED"}<p
      class="paper-status-note error"
      role="alert"
    >
      저장하지 않았습니다 — {Object.values(form.issues ?? {}).join(" · ") ||
        form.message ||
        "입력값을 확인해 주세요."}
    </p>{/if}
  {#if form?.error === "NOT_FOUND"}<p
      class="paper-status-note error"
      role="alert"
    >
      {form.message ?? "기록을 찾을 수 없습니다. 화면을 새로 고쳐 주세요."}
    </p>{/if}

  <section class="create-panel">
    <h2>1. 새 활동 기록</h2>
    <form
      method="POST"
      action="?/create"
      class="record-form"
      onformdata={dateToStart()}
    >
      <label
        ><span class="paper-label">활동명</span><input
          name="title"
          value=""
        /></label
      >
      <label
        ><span class="paper-label">유형</span><select name="type"
          >{#each data.activityTypes as type (type)}<option
              value={type}
              selected={type === "세미나"}>{type}</option
            >{/each}</select
        ></label
      >
      <label
        ><span class="paper-label">날짜</span><input
          type="date"
          name="date"
          value={today}
        /></label
      >
      <button class="paper-btn primary" type="submit">기록 생성</button>
    </form>
  </section>

  <section class="record-index">
    <div class="section-title">
      <div>
        <span>2.</span>
        <h2>기존 활동 기록</h2>
      </div>
      <label
        ><span class="paper-label">검색</span><input
          type="search"
          bind:value={query}
          placeholder="스터디명, 학기, 활동명 또는 날짜"
        /></label
      >
    </div>
    <div class="study-groups record-list">
      {#each studyGroups as group (group.study.id)}
        <div class="study-group">
          <div class="study-group-heading">
            <div>
              <span class="paper-label">{group.study.semester} · 스터디</span>
              <h3>{group.study.title}</h3>
            </div>
            <a class="paper-btn small" href={`/admin/studies/${group.study.id}`}
              >스터디 관리</a
            >
          </div>
          <details
            open={Boolean(query.trim()) ||
              group.sessions.some(
                (session) => session.activity?.id === refusedId,
              ) ||
              group.linkedActivities.some(
                (activity) => activity.id === refusedId,
              )}
          >
            <summary
              ><span
                >참가자 {group.study.participantCount}명 · 회차 {data.studyGroups?.find(
                  (original) => original.study.id === group.study.id,
                )?.sessions.length ?? group.sessions.length}개</span
              ><span>회차·연결 활동 펼치기</span></summary
            >
            <div class="study-group-body record-list">
              {#each group.sessions as session (session.event.id)}
                <div class="session-row">
                  <p class="session-label">
                    {session.event.sessionNo
                      ? `${session.event.sessionNo}회차`
                      : "회차"} · {eventStatus[session.event.status] ??
                      session.event.status} · {session.event.date.start.slice(
                      0,
                      10,
                    )}
                  </p>
                  {#if session.activity}{@render activityCard(
                      session.activity,
                    )}{:else}<p class="empty">
                      {session.event.title} · 활동 기록을 확인해 주세요.
                    </p>{/if}
                </div>
              {:else}<StudySessionEmpty
                  totalSessions={data.studyGroups?.find(
                    (original) => original.study.id === group.study.id,
                  )?.sessions.length ?? group.sessions.length}
                />{/each}
              {#if group.linkedActivities.length}<h4>연결 활동</h4>
                <p class="scope-note">
                  회차 이벤트에 연결되지 않은 활동입니다.
                </p>{/if}
              {#each group.linkedActivities as activity (activity.id)}{@render activityCard(
                  activity,
                )}{/each}
            </div>
          </details>
        </div>
      {/each}
    </div>
    <h3 class="other-activities-title">기타 활동 기록</h3>
    <div class="record-list">
      {#each activities as activity (activity.id)}
        {@render activityCard(activity)}
      {:else}<p class="empty">검색 조건에 맞는 활동이 없습니다.</p>{/each}
    </div>
  </section>
  <p class="freshness">
    프리뷰 데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}
  </p>
</article>

<style>
  .study-group {
    border: 1px solid var(--latex-rule);
  }
  .study-group-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.8rem;
  }
  .study-group-heading h3 {
    margin: 0.25rem 0 0;
    font-size: 1rem;
  }
  .study-group-heading a {
    flex-shrink: 0;
  }
  .study-group-body {
    padding: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  .study-group-body h4 {
    margin: 0.6rem 0 0;
  }
  .session-label {
    margin: 0 0 0.4rem;
    font-size: 0.75rem;
    color: var(--latex-muted);
  }
  .other-activities-title {
    margin: 1.2rem 0 0.7rem;
    font-size: 1rem;
  }
  .activity-admin-paper {
    width: min(100%, 1120px);
  }
  .scope-note {
    margin: 0 0 1rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
  }
  .create-panel,
  .record-index {
    margin-top: 1.2rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  h2 {
    margin: 0;
    font-size: 1.08rem;
    font-weight: 570;
  }
  .record-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 10rem 10rem auto;
    gap: 0.65rem;
    align-items: end;
    margin-top: 0.7rem;
  }
  .record-form input,
  .record-form select,
  .section-title input {
    width: 100%;
    min-height: 2.7rem;
    padding: 0.55rem 0.65rem;
  }
  form small {
    display: block;
    margin-top: 0.2rem;
    color: var(--color-danger-text);
    font-size: 0.66rem;
  }
  form small.field-note {
    color: var(--latex-muted);
  }
  .section-title {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.7rem;
  }
  .section-title > div {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .section-title > div > span {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 700;
  }
  .section-title label {
    width: min(100%, 21rem);
  }
  .record-list {
    display: grid;
    gap: 0.55rem;
  }
  .record-card {
    border: 1px solid var(--latex-rule);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.72rem 0.8rem;
    cursor: pointer;
  }
  summary div {
    display: grid;
  }
  summary span,
  summary small,
  .delete-row span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.57rem;
  }
  summary strong {
    font-size: 0.96rem;
    font-weight: 570;
  }
  .record-body {
    display: grid;
    gap: 0.9rem;
    padding: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  .study-link-form {
    display: flex;
    align-items: end;
    gap: 0.7rem;
  }
  .study-link-fixed {
    display: grid;
    gap: 0.2rem;
    margin: 0;
  }
  .study-link-fixed small {
    color: var(--latex-muted);
    font-size: 0.66rem;
  }
  .study-link-form label {
    flex: 1;
    min-width: 0;
  }
  .study-link-form select {
    width: 100%;
    min-height: 2.7rem;
    padding: 0.55rem 0.65rem;
  }
  .attendee-form {
    display: flex;
    align-items: end;
    gap: 0.7rem;
  }
  .attendee-form fieldset {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
  }
  .attendee-form legend {
    padding: 0 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
  }
  .member-picker {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
  }
  .member-picker label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem;
    border: 1px solid color-mix(in srgb, var(--latex-rule) 30%, transparent);
  }
  .member-picker input {
    margin: 0;
  }
  .member-picker span {
    display: grid;
    font-size: 0.72rem;
  }
  .member-picker small {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.56rem;
  }
  .delete-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 0.7rem;
    border-top: 1px solid var(--latex-rule);
  }
  .freshness {
    margin: 1rem 0 0;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    text-align: right;
    text-transform: uppercase;
  }
  @media (max-width: 800px) {
    .record-form {
      grid-template-columns: 1fr 1fr;
    }
    .record-form label:first-of-type {
      grid-column: 1 / -1;
    }
    .member-picker {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .record-form {
      grid-template-columns: 1fr;
    }
    .record-form label:first-of-type {
      grid-column: auto;
    }
    .section-title,
    .study-link-form,
    .attendee-form,
    .delete-row,
    summary {
      align-items: stretch;
      flex-direction: column;
    }
    .section-title label {
      width: 100%;
    }
    .member-picker {
      grid-template-columns: 1fr;
    }
    .study-link-form button,
    .attendee-form button,
    .delete-row button {
      width: 100%;
    }
  }
</style>
