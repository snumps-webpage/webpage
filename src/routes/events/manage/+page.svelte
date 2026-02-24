<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();
  let processingEventId = $state<string | null>(null);
</script>

<article class="paper-document manage-paper">
  <header class="paper-document-header">
    <h1 class="paper-document-title">세미나 신청자 출석 관리</h1>
    <p class="paper-document-subtitle">Presenter Attendance Control</p>
  </header>

  {#if data.forbidden}
    <p class="paper-status-note error">
      회원 정보가 확인되지 않아 발표자 관리 화면에 접근할 수 없습니다.
    </p>
  {:else if data.managedEvents.length === 0}
    <p class="paper-form-note empty-hint">
      본인이 발표자로 등록된 세미나 이벤트가 없습니다.
    </p>
  {:else}
    {#if form?.error}
      <p class="paper-status-note error">{form.error}</p>
    {:else if form?.success}
      <p class="paper-status-note success">출석 정보가 저장되었습니다.</p>
    {/if}

    <div class="event-list">
      {#each data.managedEvents as event (event.id)}
        <section class="event-card">
          <div class="event-header">
            <h2>{event.title}</h2>
            <p class="meta">
              <span>{event.type}</span>
              <span>·</span>
              <span>{event.date || "일정 미정"}</span>
            </p>
          </div>

          <form
            method="POST"
            action="?/saveAttendance"
            use:enhance={() => {
              processingEventId = event.id;
              return async ({ update }) => {
                await update();
                processingEventId = null;
              };
            }}
            class="attendance-form"
          >
            <input type="hidden" name="eventId" value={event.id} />

            {#if event.applicants.length === 0}
              <p class="paper-form-note empty-hint">신청자가 없습니다.</p>
            {:else}
              <div class="applicant-list">
                {#each event.applicants as applicant (applicant.id)}
                  <label class="applicant-item">
                    <input
                      type="checkbox"
                      name="selectedApplicantIds"
                      value={applicant.id}
                      checked={event.checkedApplicantIds.includes(applicant.id)}
                    />
                    <span class="name">{applicant.name}</span>
                    {#if applicant.department}
                      <span class="department">{applicant.department}</span>
                    {/if}
                  </label>
                {/each}
              </div>
            {/if}

            <div class="actions">
              <button
                class="paper-btn primary"
                disabled={processingEventId === event.id}
              >
                {processingEventId === event.id ? "저장 중..." : "출석 저장"}
              </button>
            </div>
          </form>
        </section>
      {/each}
    </div>
  {/if}
</article>

<style>
  .manage-paper {
    width: min(100%, 54rem);
    margin: 1.2rem auto;
    padding: 1rem;
    background: var(--latex-bg);
    border: 1px solid var(--latex-rule);
    border-top-width: 2px;
    color: var(--latex-text);
  }

  .event-list {
    display: grid;
    gap: 0.8rem;
  }

  .event-card {
    border-top: 1px solid var(--border-color);
    padding-top: 0.62rem;
  }

  .event-header h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1rem;
    font-style: italic;
  }

  .meta {
    margin: 0.2rem 0 0.4rem;
    color: var(--text-secondary);
    font-size: 0.82rem;
    display: flex;
    gap: 0.28rem;
    flex-wrap: wrap;
  }

  .attendance-form {
    display: grid;
    gap: 0.52rem;
  }

  .applicant-list {
    display: grid;
    gap: 0.35rem;
  }

  .applicant-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.42rem 0.5rem;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
  }

  .applicant-item input {
    margin: 0;
  }

  .name {
    font-weight: 560;
    color: var(--text-primary);
  }

  .department {
    color: var(--text-secondary);
    font-size: 0.82rem;
  }

  .actions {
    display: flex;
    justify-content: flex-start;
  }

  .empty-hint {
    margin: 0;
    padding: 0.32rem 0;
    color: var(--text-secondary);
    font-style: italic;
  }
</style>

