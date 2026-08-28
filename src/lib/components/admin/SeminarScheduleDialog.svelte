<script lang="ts">
  import { enhance } from "$app/forms";
  import { untrack } from "svelte";
  import type {
    AdminSeminarItem,
    AdminSeminarOperationResult,
    SeminarScheduleIssues,
  } from "$lib/domain/admin-seminars";

  interface Props {
    seminar: AdminSeminarItem;
    onSaved: (result: AdminSeminarOperationResult) => void;
    onClose: () => void;
  }

  let { seminar, onSaved, onClose }: Props = $props();
  const initialSchedule = untrack(() => seminar.schedule);

  let dialog = $state<HTMLDialogElement>();
  let startsAtLocal = $state(initialSchedule?.startsAt.slice(0, 16) ?? "");
  let endsAtLocal = $state(initialSchedule?.endsAt?.slice(0, 16) ?? "");
  let location = $state(initialSchedule?.location ?? "");
  let issues = $state<SeminarScheduleIssues>({});
  let processing = $state(false);

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  function clearIssue(field: keyof SeminarScheduleIssues) {
    if (!issues[field]) return;
    const next = { ...issues };
    delete next[field];
    issues = next;
  }
</script>

<dialog
  bind:this={dialog}
  class="schedule-dialog"
  onclose={() => {
    if (!processing) onClose();
  }}
>
  <form
    method="POST"
    action="?/scheduleSeminar"
    use:enhance={() => {
      processing = true;
      issues = {};

      return async ({ result }) => {
        processing = false;

        if (result.type === "success") {
          onSaved(result.data as AdminSeminarOperationResult);
          return;
        }

        if (result.type === "failure") {
          const data = result.data as { issues?: SeminarScheduleIssues };
          issues = data.issues ?? {
            _form: "일정을 저장하지 못했습니다.",
          };
          return;
        }

        issues = { _form: "일정을 저장하지 못했습니다." };
      };
    }}
  >
    <input type="hidden" name="seminarId" value={seminar.id} />

    <header>
      <p class="eyebrow">Schedule · KST</p>
      <h2>{seminar.schedule ? "세미나 일정 수정" : "세미나 일정 입력"}</h2>
      <p>{seminar.title}</p>
    </header>

    {#if issues._form}
      <p class="form-error" role="alert">{issues._form}</p>
    {/if}

    <div class="schedule-fields">
      <div class="paper-field">
        <label for={`starts-${seminar.id}`} class="paper-label">시작 일시 <span>*</span></label>
        <input
          id={`starts-${seminar.id}`}
          name="startsAtLocal"
          type="datetime-local"
          bind:value={startsAtLocal}
          oninput={() => clearIssue("startsAtLocal")}
          aria-invalid={!!issues.startsAtLocal}
          aria-describedby={issues.startsAtLocal ? "starts-error" : "timezone-hint"}
        />
        {#if issues.startsAtLocal}
          <p class="field-error" id="starts-error">{issues.startsAtLocal}</p>
        {:else}
          <p class="paper-hint" id="timezone-hint">한국 시간(KST)으로 저장됩니다.</p>
        {/if}
      </div>

      <div class="paper-field">
        <label for={`ends-${seminar.id}`} class="paper-label">종료 일시</label>
        <input
          id={`ends-${seminar.id}`}
          name="endsAtLocal"
          type="datetime-local"
          bind:value={endsAtLocal}
          oninput={() => clearIssue("endsAtLocal")}
          aria-invalid={!!issues.endsAtLocal}
          aria-describedby={issues.endsAtLocal ? "ends-error" : undefined}
        />
        {#if issues.endsAtLocal}
          <p class="field-error" id="ends-error">{issues.endsAtLocal}</p>
        {/if}
      </div>

      <div class="paper-field full-width">
        <label for={`location-${seminar.id}`} class="paper-label">장소 <span>*</span></label>
        <input
          id={`location-${seminar.id}`}
          name="location"
          type="text"
          maxlength="160"
          bind:value={location}
          oninput={() => clearIssue("location")}
          aria-invalid={!!issues.location}
          aria-describedby={issues.location ? "location-error" : undefined}
          placeholder="예: 27동 220호"
        />
        {#if issues.location}
          <p class="field-error" id="location-error">{issues.location}</p>
        {/if}
      </div>
    </div>

    <aside class="publication-note">
      <strong>저장은 공개가 아닙니다.</strong>
      {#if seminar.publicationStatus === "published"}
        저장하면 회원 페이지의 일정이 갱신되고 전 회원에게 변경 안내 메일을 보냅니다.
      {:else}
        일정 저장 후 ‘활동·출석 이벤트 공개’를 누르면 회원 페이지에 노출되고 확정 일정 안내
        메일을 보냅니다. 저장만으로는 메일을 보내지 않습니다.
      {/if}
    </aside>

    <div class="dialog-actions">
      <button
        type="button"
        class="paper-btn secondary"
        disabled={processing}
        onclick={() => dialog?.close()}
      >취소</button>
      <button class="paper-btn primary" disabled={processing}>
        {processing ? "저장 중…" : "일정 저장"}
      </button>
    </div>
  </form>
</dialog>

<style>
  .schedule-dialog {
    width: min(94vw, 720px);
    max-height: min(88vh, 760px);
    margin: auto;
    padding: 0;
    border: 1px solid var(--latex-rule);
    border-top: 4px solid var(--latex-text);
    background: var(--latex-bg);
    color: var(--latex-text);
    overflow: auto;
  }

  .schedule-dialog::backdrop {
    background: rgb(0 0 0 / 42%);
    backdrop-filter: blur(2px);
  }

  form {
    padding: 1.2rem;
  }

  header {
    padding-bottom: 0.85rem;
    border-bottom: 1px solid var(--latex-rule);
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 560;
  }

  header > p:last-child {
    margin: 0.35rem 0 0;
    color: var(--latex-muted);
    font-size: 0.88rem;
  }

  .form-error {
    margin: 0.85rem 0 0;
    padding: 0.6rem;
    border-left: 3px solid var(--latex-accent);
    background: color-mix(in srgb, var(--latex-accent) 7%, transparent);
    color: var(--latex-accent);
    font-size: 0.82rem;
  }

  .schedule-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
    margin-top: 1rem;
  }

  .full-width {
    grid-column: 1 / -1;
  }

  .paper-label span {
    color: var(--latex-accent);
  }

  .field-error {
    margin: 0.35rem 0 0;
    color: var(--latex-accent);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .publication-note {
    margin-top: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.6;
  }

  .publication-note strong {
    display: block;
    color: var(--latex-text);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 1rem;
  }

  @media (max-width: 620px) {
    .schedule-dialog {
      width: calc(100vw - 1rem);
      max-height: calc(100vh - 1rem);
    }

    form {
      padding: 0.9rem;
    }

    .schedule-fields {
      grid-template-columns: 1fr;
    }

    .full-width {
      grid-column: auto;
    }

    .dialog-actions {
      flex-direction: column-reverse;
    }

    .dialog-actions :global(button) {
      width: 100%;
    }
  }
</style>
