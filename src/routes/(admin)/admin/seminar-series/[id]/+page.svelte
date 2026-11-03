<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import { pickerChoice, formerIds } from "$lib/domain/recorded-people";
  import { MANUSCRIPT } from "$lib/constants";
  let { data, form } = $props();
  const labels: Record<string, string> = {
    unscheduled: "일정 미정",
    scheduled: "공개 준비",
    published: "공개됨",
    cancelled: "취소됨",
  };
</script>

<svelte:head><title>{data.parent.title} · 세미나 관리</title></svelte:head>
<article class="paper-document">
  <ManuscriptHeader
    title={data.parent.title}
    subtitle="Seminar sessions"
    figure={MANUSCRIPT.FIGURES.ADMIN_SEMINARS}
  />
  <AdminSectionNav />
  <p><a href="/admin/seminar-series">← 세미나 묶음 목록</a></p>
  {#if form?.error}<p class="notice" role="alert">
      저장하지 못했습니다. {form.error} 입력값과 현재 상태를 확인해 주세요.
    </p>{:else if form?.success}<p class="notice" role="status">
      저장했습니다.
    </p>{/if}
  <details class="panel">
    <summary>공통 제목·소개 수정</summary>
    <form method="POST" action="?/update">
      <label
        >공통 제목 <input
          name="title"
          value={data.parent.title}
          required
          maxlength="300"
        /></label
      >
      <label
        >소개 <textarea name="description" rows="3" maxlength="20000"
          >{data.parent.description}</textarea
        ></label
      >
      <p class="help">기존 회차의 제목·자료·공지 내용은 바뀌지 않습니다.</p>
      <button class="paper-btn secondary" type="submit">공통 정보 저장</button>
    </form>
  </details>
  <section class="panel">
    <h2>새 회차 추가</h2>
    <form method="POST" action="?/createSession">
      <label
        >회차 제목 <input
          name="title"
          maxlength="300"
          placeholder="비우면 공통 제목과 회차 번호 사용"
        /></label
      >
      <label
        >학기 <input
          name="semester"
          value={data.currentTerm}
          required
          pattern={"[0-9]{2}-[12SW]"}
        /></label
      >
      <fieldset>
        <legend>발표자</legend>
        <div class="people">
          {#each data.members as member (member.id)}<label class="person"
              ><input
                type="checkbox"
                name="presenterIds"
                value={member.id}
              /><span>{member.name} <small>{member.department}</small></span
              ></label
            >{/each}
        </div>
      </fieldset>
      <label>외부 발표자 <input name="externalPresenters" /></label>
      <p class="help">
        일정 미정 회차로 만듭니다. 이후 해당 회차의 일정·공개 화면에서
        운영하세요. 관리자 직접 추가 회차는 전 회원 자동 공지를 보내지 않습니다.
      </p>
      <button class="paper-btn" type="submit">회차 만들기</button>
    </form>
  </section>
  <section class="sessions">
    <h2>회차와 출석 <small>{data.sessions.length}개</small></h2>
    {#each data.sessions as session (session.id)}
      <details class="panel" open={form?.seminarId === session.id}>
        <summary
          >{session.sessionNo}회차 · {session.title}
          <span class="status">{labels[session.publicationStatus]}</span
          ></summary
        >
        <p class="help">
          발표자: {session.presenterNames.join(", ") || "미지정"}
        </p>
        <p>
          {session.schedule
            ? new Date(session.schedule.startsAt).toLocaleDateString("ko-KR", {
                timeZone: "Asia/Seoul",
              })
            : "일정 미정"}{session.schedule?.startTime
            ? ` ${session.schedule.startTime}`
            : ""}{session.schedule ? ` · ${session.schedule.location}` : ""}
        </p>
        <div class="links">
          <a
            class="paper-btn secondary"
            href={`/admin/seminars#seminar-${session.id}`}
            >이 회차 일정·공개·취소</a
          ><a href={`/admin/seminars#seminar-record-${session.id}`}
            >발표자·자료 수정</a
          ><a href={`/archive/seminars/${session.id}`}>회차 상세</a>
        </div>
        {#if session.eventId && session.publicationStatus !== "cancelled"}
          <form method="POST" action="?/saveAttendance">
            <input type="hidden" name="seminarId" value={session.id} />
            <fieldset>
              <legend>이 회차 출석자</legend>
              <div class="people">
                {#each data.pickers as member (member.id)}{@const choice =
                    pickerChoice(member, session.attendeeIds)}<label
                    class="person"
                    ><input
                      type="checkbox"
                      name="attendeeIds"
                      value={choice.value}
                      checked={choice.checked}
                    /><span
                      >{member.name} <small>{member.department}</small></span
                    ></label
                  >{/each}
                {#each formerIds(session.attendeeIds, data.pickers) as id (id)}<label
                    class="person"
                    ><input
                      type="checkbox"
                      name="attendeeIds"
                      value={id}
                      checked
                    /><span>기존 출석자 ({id})</span></label
                  >{/each}
              </div>
            </fieldset>
            <p class="help">
              선택한 명단으로 이 회차의 출석을 저장합니다. 다른 회차의 출석은
              바뀌지 않습니다.
            </p>
            <button class="paper-btn secondary" type="submit">출석 저장</button>
          </form>
        {:else}<p class="help">
            {session.publicationStatus === "cancelled"
              ? "취소된 회차의 기존 출석은 보존됩니다."
              : "일정 확정 후 공개하면 출석을 관리할 수 있습니다."}
          </p>{/if}
      </details>
    {:else}<p class="empty">
        회차가 없습니다. 위에서 첫 회차를 추가하세요.
      </p>{/each}
  </section>
</article>

<style>
  .panel {
    margin: 1.25rem 0;
    padding: 1rem;
    border: 1px solid var(--latex-rule);
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    line-height: 1.6;
  }
  .status {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--latex-muted);
    margin-left: 0.5rem;
  }
  h2 {
    font-size: 1.1rem;
    margin: 0 0 1rem;
  }
  form {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }
  label {
    display: grid;
    gap: 0.4rem;
  }
  input:not([type="checkbox"]),
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.6rem;
    border: 1px solid var(--latex-rule);
    background: var(--latex-bg);
    color: var(--latex-text);
    font: inherit;
  }
  fieldset {
    min-width: 0;
    border: 1px solid var(--latex-rule);
    padding: 0.75rem;
  }
  legend {
    padding: 0 0.25rem;
  }
  .people {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.5rem;
    max-height: 18rem;
    overflow: auto;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
  }
  .person small {
    color: var(--latex-muted);
  }
  .help,
  .empty {
    color: var(--latex-muted);
    font-size: 0.85rem;
    line-height: 1.6;
  }
  .links {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .notice {
    padding: 1rem;
    border: 1px solid var(--latex-rule);
  }
  form button {
    justify-self: start;
  }
  .sessions {
    margin-top: 2rem;
  }
  h2 small {
    font-weight: 400;
    color: var(--latex-muted);
  }
  @media (max-width: 600px) {
    .people {
      grid-template-columns: 1fr;
    }
    .panel {
      padding: 0.75rem;
    }
  }
</style>
