<script lang="ts">
  import AdminStudyParticipantEditor from "$lib/components/admin/AdminStudyParticipantEditor.svelte";
  import { organizerChoices } from "$lib/domain/recorded-people";
  import { isStudyClosed, STUDY_STATUS_LABELS } from "$lib/domain/studies";
  let { data, form } = $props();
  const choices = $derived(
    organizerChoices(
      isStudyClosed(data.record.status),
      data.record.organizerIds,
      data.members,
      data.pickers,
    ),
  );
  const messages: Record<string, string> = {
    sessionCreated: "회차를 추가했습니다.",
    sessionUpdated: "회차를 수정했습니다.",
    sessionCancelled: "회차를 취소했습니다.",
    attendanceSaved: "출석을 저장했습니다.",
    studyParticipantsSet: "참가자를 저장했습니다.",
    studyOrganizerSet: "주최자를 변경했습니다.",
  };
  const labels: Record<string, string> = {
    active: "출석 진행",
    expired: "종료",
    cancelled: "취소",
  };
</script>

<svelte:head
  ><title>{data.record.title} · 관리자 스터디 관리</title></svelte:head
>
<article class="paper-document study-management">
  <header>
    <a href="/admin/studies">← 스터디 목록</a>
    <p class="paper-label">Admin · Study Management</p>
    <h1>{data.record.title}</h1>
    <p>
      {data.record.term} · {STUDY_STATUS_LABELS[data.record.status]} · 참가자 {data
        .record.participantIds.length}명 · 회차 {data.sessions.length}개
    </p>
  </header>
  {#if form?.success}<p class="paper-status-note success" role="status">
      {messages[typeof form.operation === "string" ? form.operation : ""] ??
        "저장했습니다."}
    </p>{/if}
  {#if form?.error}<div class="paper-status-note error" role="alert">
      <p>
        {form.message ??
          "저장하지 않았습니다. 입력값과 대상 회차를 확인해 주세요."}
      </p>
      {#if form.issues}<ul>
          {#each Object.entries(form.issues) as [field, issue] (field)}<li>
              {issue}
            </li>{/each}
        </ul>{/if}
    </div>{/if}

  <section aria-labelledby="organizer-heading">
    <h2 id="organizer-heading">주최자</h2>
    <p>{data.record.organizerNames.join(", ")}</p>
    <form
      method="POST"
      action="?/setOrganizer"
      onsubmit={(e) => {
        if (!confirm("주최자를 변경하고 대기 중인 양도를 취소할까요?"))
          e.preventDefault();
      }}
    >
      <label
        ><span class="paper-label">새 주최자</span><select name="organizerId"
          >{#each choices as choice (choice.value)}<option
              value={choice.value}
              selected={choice.selected}>{choice.label}</option
            >{/each}</select
        ></label
      >
      <button class="paper-btn" type="submit">주최자 변경</button>
    </form>
  </section>
  <AdminStudyParticipantEditor record={data.record} pickers={data.pickers} />

  <section aria-labelledby="create-heading">
    <h2 id="create-heading">새 회차 추가</h2>
    <p>
      종료·취소된 스터디도 회차를 관리할 수 있습니다. 스터디 상태는 바뀌지
      않습니다.
    </p>
    <form method="POST" action="?/createSession" class="session-form">
      <label
        ><span class="paper-label">회차 제목 · 생략 시 자동 지정</span><input
          name="title"
          maxlength="120"
        /></label
      >
      <label
        ><span class="paper-label">시작 일시 · 한국 시간</span><input
          name="date"
          type="datetime-local"
          required
        /></label
      >
      <button class="paper-btn primary" type="submit">회차 추가</button>
    </form>
  </section>
  <section aria-labelledby="sessions-heading">
    <h2 id="sessions-heading">회차와 출석</h2>
    {#each data.sessions as session (session.id)}
      <details class="session">
        <summary
          ><strong>{session.sessionNo}회차 · {session.title}</strong><span
            >{session.date.start.slice(0, 16).replace("T", " ")} · {labels[
              session.effectiveStatus
            ]} · 출석 {session.attendeeIds.length}명</span
          ></summary
        >
        {#if session.status === "cancelled"}
          <p>취소된 회차입니다. 회차와 출석을 변경할 수 없습니다.</p>
        {:else}
          <form method="POST" action="?/updateSession" class="session-form">
            <input type="hidden" name="eventId" value={session.id} />
            <label
              ><span class="paper-label">회차 제목</span><input
                name="title"
                value={session.title}
                maxlength="120"
                required
              /></label
            >
            <label
              ><span class="paper-label">시작 일시 · 한국 시간</span><input
                name="date"
                type="datetime-local"
                value={session.date.start.slice(0, 16)}
                required
              /></label
            >
            <button class="paper-btn" type="submit">회차 수정</button>
          </form>
          <form method="POST" action="?/saveAttendance">
            <input type="hidden" name="eventId" value={session.id} />
            <fieldset>
              <legend>참가자 출석</legend>
              <div class="attendees">
                {#each data.record.participantPeople as person (person.id)}<label
                    ><input
                      type="checkbox"
                      name="attendeeIds"
                      value={person.id}
                      checked={session.attendeeIds.includes(person.id)}
                    /><span>{person.name} · {person.department}</span></label
                  >{/each}
              </div>
            </fieldset>
            <p>참가자 외 현장 출석 기록은 유지합니다.</p>
            <button class="paper-btn" type="submit">출석 저장</button>
          </form>
          <form
            method="POST"
            action="?/cancelSession"
            onsubmit={(e) => {
              if (!confirm("이 회차를 취소할까요? 취소 후 되돌릴 수 없습니다."))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="eventId" value={session.id} /><button
              class="paper-btn"
              type="submit">회차 취소</button
            >
          </form>
        {/if}
      </details>
    {:else}<p class="empty">
        회차가 없습니다. 위에서 첫 회차를 추가해 주세요.
      </p>{/each}
  </section>
</article>

<style>
  .study-management {
    display: grid;
    gap: 1.2rem;
  }
  header h1 {
    margin: 0.5rem 0;
  }
  header p,
  section > p,
  form > p,
  details > p {
    color: var(--latex-muted);
    font-size: 0.8rem;
  }
  section {
    border-top: 1px solid var(--latex-rule);
    padding-top: 1rem;
  }
  h2 {
    font-size: 1.15rem;
    margin: 0 0 0.7rem;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.7rem;
    margin: 0.7rem 0;
  }
  label {
    display: grid;
    gap: 0.3rem;
  }
  input:not([type="checkbox"]),
  select {
    padding: 0.55rem;
    width: 100%;
  }
  .session-form label:first-child {
    flex: 1;
    min-width: 12rem;
  }
  .session {
    border: 1px solid var(--latex-rule);
    padding: 0.8rem;
    margin-top: 0.7rem;
  }
  summary {
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  summary span {
    color: var(--latex-muted);
    font-size: 0.75rem;
  }
  fieldset {
    width: 100%;
    border: 1px solid var(--latex-rule);
  }
  .attendees {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.5rem;
  }
  .attendees label {
    display: flex;
    align-items: center;
    font-size: 0.8rem;
  }
  .empty {
    border: 1px dashed var(--latex-rule);
    padding: 1rem;
  }
  @media (max-width: 520px) {
    form {
      align-items: stretch;
      flex-direction: column;
    }
    .session-form label:first-child {
      min-width: 0;
    }
  }
</style>
