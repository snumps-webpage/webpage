<script lang="ts">
  import { enhance } from "$app/forms";
  import { actionErrorText } from "$lib/domain/api";
  import { tick, untrack } from "svelte";
  import type {
    StudyRequestFormField,
    StudyRequestFormIssues,
  } from "$lib/domain/studies";
  import type { StudyProposalActionState } from "$lib/domain/study-proposal";

  interface Props {
    defaultSemester: string;
    canSubmit?: boolean;
    form?: StudyProposalActionState | null;
  }

  let { defaultSemester, canSubmit = true, form = null }: Props = $props();
  const starting = untrack(() =>
    form?.operation === "requestSubmitted" ? form.values : undefined,
  );
  let title = $state(starting?.title ?? "");
  let textbook = $state(starting?.textbook ?? "");
  let description = $state(starting?.description ?? "");
  // An intentionally empty submitted value must stay empty after a failed POST.
  let semester = $state(starting?.semester ?? untrack(() => defaultSemester));
  let processing = $state(false);
  let formElement = $state<HTMLFormElement>();
  let cleared = $state<StudyRequestFormField[]>([]);
  let proposalResult = $derived(
    form?.operation === "requestSubmitted" ? form : null,
  );
  let issues = $derived(
    Object.fromEntries(
      Object.entries(proposalResult?.issues ?? {}).filter(
        ([field]) => !cleared.includes(field as StudyRequestFormField),
      ),
    ) as StudyRequestFormIssues,
  );
  let formError = $derived(
    issues._form ??
      (proposalResult?.error && proposalResult.error !== "VALIDATION_FAILED"
        ? actionErrorText(
            proposalResult,
            "신청을 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          )
        : null),
  );

  function clearIssue(field: StudyRequestFormField) {
    if (issues[field] && !cleared.includes(field))
      cleared = [...cleared, field];
  }
</script>

{#if proposalResult?.success}
  <section
    class="proposal-receipt"
    role="status"
    aria-labelledby="receipt-heading"
  >
    <p class="receipt-label">접수 완료 · 검토 중</p>
    <h3 id="receipt-heading">신청을 접수했습니다</h3>
    <p>
      운영진이 개설 내용을 검토합니다. 승인 전에는 모집이 시작되지 않습니다.
    </p>
    <p>
      내 신청에서 접수 내용과 상태를 확인하고, 승인 전에는 철회할 수 있습니다.
    </p>
    <div class="form-actions">
      <a href="#my-study-requests" class="paper-btn primary">접수한 신청 확인</a
      >
      <a href="/study/apply" data-sveltekit-reload class="paper-btn"
        >새 신청서 작성</a
      >
    </div>
  </section>
{:else}
  <form
    bind:this={formElement}
    method="POST"
    action="?/submit"
    aria-busy={processing}
    use:enhance={({ cancel }) => {
      if (processing || !canSubmit) {
        cancel();
        return;
      }
      processing = true;
      cleared = [];
      return async ({ update }) => {
        try {
          await update({ reset: false });
        } finally {
          processing = false;
        }
        await tick();
        formElement
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      };
    }}
  >
    {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
    {#if !canSubmit}<p class="readonly-note">
        현재 계정은 열람만 가능합니다. 이번 학기 등록 회원만 새 신청을 제출할 수
        있습니다.
      </p>{/if}

    <fieldset class="proposal-fields" disabled={processing || !canSubmit}>
      <legend class="sr-only">스터디 개설 내용</legend>
      <div class="paper-field">
        <label class="paper-label" for="study-title"
          >스터디 이름 <span aria-hidden="true">*</span></label
        >
        <input
          id="study-title"
          name="title"
          maxlength="120"
          bind:value={title}
          oninput={() => clearIssue("title")}
          aria-required="true"
          aria-invalid={!!issues.title}
          aria-describedby={issues.title
            ? "study-title-error"
            : "study-title-hint"}
          placeholder="예: 범주론 입문 읽기 모임"
        />
        {#if issues.title}<p class="field-error" id="study-title-error">
            {issues.title}
          </p>{:else}<p class="paper-hint" id="study-title-hint">
            공부할 주제가 드러나는 이름으로 적어 주세요. 2–120자
          </p>{/if}
      </div>
      <div class="form-row">
        <div class="paper-field">
          <label class="paper-label" for="study-textbook"
            >교재 또는 자료 <span aria-hidden="true">*</span></label
          >
          <input
            id="study-textbook"
            name="textbook"
            maxlength="240"
            bind:value={textbook}
            oninput={() => clearIssue("textbook")}
            aria-required="true"
            aria-invalid={!!issues.textbook}
            aria-describedby={issues.textbook
              ? "study-textbook-error"
              : "study-textbook-hint"}
            placeholder="책, 논문, 강의노트 등"
          />
          {#if issues.textbook}<p class="field-error" id="study-textbook-error">
              {issues.textbook}
            </p>{:else}<p class="paper-hint" id="study-textbook-hint">
              함께 읽을 자료의 제목을 적어 주세요.
            </p>{/if}
        </div>
        <div class="paper-field">
          <label class="paper-label" for="study-semester"
            >학기 <span aria-hidden="true">*</span></label
          >
          <input
            id="study-semester"
            name="semester"
            maxlength="4"
            bind:value={semester}
            oninput={() => clearIssue("semester")}
            aria-required="true"
            aria-invalid={!!issues.semester}
            aria-describedby={issues.semester
              ? "study-semester-error"
              : "study-semester-hint"}
            placeholder="26-2"
          />
          {#if issues.semester}<p class="field-error" id="study-semester-error">
              {issues.semester}
            </p>{:else}<p class="paper-hint" id="study-semester-hint">
              예: 26-1·26-2·26-S·26-W
            </p>{/if}
        </div>
      </div>
      <div class="paper-field">
        <label class="paper-label" for="study-description"
          >진행 내용 <span aria-hidden="true">*</span></label
        >
        <textarea
          id="study-description"
          name="description"
          rows="7"
          maxlength="2400"
          bind:value={description}
          oninput={() => clearIssue("description")}
          aria-required="true"
          aria-invalid={!!issues.description}
          aria-describedby={issues.description
            ? "study-description-error"
            : "study-description-hint"}
          placeholder="무엇을 공부하고 어떤 방식으로 진행할지 적어 주세요."
        ></textarea>
        {#if issues.description}<p
            class="field-error"
            id="study-description-error"
          >
            {issues.description}
          </p>{:else}<p class="paper-hint" id="study-description-hint">
            학습 범위, 진행 방식, 필요한 배경 지식을 적어 주세요. 10–2,400자
          </p>{/if}
      </div>
    </fieldset>
    <p class="submission-note">
      모든 항목은 필수입니다. 일정은 승인 후 주최자가 회차별로 등록합니다.
    </p>
    <div class="form-actions">
      <a href="/study" class="paper-btn">스터디 목록</a>
      <button
        type="submit"
        class="paper-btn primary"
        disabled={processing || !canSubmit}
        >{processing ? "신청 제출 중…" : "개설 신청 제출"}</button
      >
    </div>
  </form>
{/if}

<style>
  form,
  .proposal-fields {
    display: grid;
    gap: 1.25rem;
  }
  .proposal-fields {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .paper-field {
    margin: 0;
  }
  .paper-label span {
    color: var(--latex-accent);
  }
  .form-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(8rem, 0.85fr);
    gap: 1rem;
  }
  .proposal-fields :global(input),
  .proposal-fields :global(textarea) {
    border-color: var(--latex-muted);
  }
  .proposal-fields :global([aria-invalid="true"]) {
    border-left: 3px solid var(--latex-accent);
  }
  .field-error,
  .form-error {
    margin: 0.35rem 0 0;
    color: var(--latex-accent);
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .form-error,
  .readonly-note {
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .readonly-note,
  .submission-note {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.82rem;
  }
  .proposal-receipt {
    padding: 0.25rem 0;
  }
  .receipt-label {
    margin: 0;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  .proposal-receipt h3 {
    margin: 0.4rem 0 0.9rem;
    font-size: 1.35rem;
    font-weight: 550;
  }
  .proposal-receipt > p:not(.receipt-label) {
    color: var(--latex-muted);
    font-size: 0.9rem;
  }
  .form-actions {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.65rem;
    padding-top: 1rem;
    border-top: 1px solid var(--latex-rule);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 620px) {
    .form-row {
      grid-template-columns: 1fr;
    }
    .form-actions {
      flex-direction: column-reverse;
    }
    .form-actions a,
    .form-actions button {
      width: 100%;
    }
  }
</style>
