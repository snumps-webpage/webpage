<script lang="ts">
  import { enhance } from "$app/forms";
  import { tick } from "svelte";
  import type {
    StudyOperationResult,
    StudyRequestFormIssues,
  } from "$lib/domain/studies";

  interface Props {
    defaultSemester: string;
    onSubmitted: (result: StudyOperationResult) => void;
  }

  let { defaultSemester, onSubmitted }: Props = $props();
  let title = $state("");
  let textbook = $state("");
  let description = $state("");
  let semester = $state("");
  let issues = $state<StudyRequestFormIssues>({});
  let processing = $state(false);
  let formElement = $state<HTMLFormElement>();

  function clearIssue(field: keyof StudyRequestFormIssues) {
    if (!issues[field]) return;
    const next = { ...issues };
    delete next[field];
    issues = next;
  }

  $effect(() => {
    if (!semester) semester = defaultSemester;
  });
</script>

<form
  bind:this={formElement}
  method="POST"
  use:enhance={() => {
    processing = true;
    issues = {};
    return async ({ result }) => {
      processing = false;
      if (result.type === "success") {
        onSubmitted(result.data as StudyOperationResult);
        title = "";
        textbook = "";
        description = "";
        return;
      }
      if (result.type === "failure") {
        const data = result.data as {
          issues?: StudyRequestFormIssues;
          error?: string;
        };
        issues = data.issues ?? {
          _form: data.error ?? "스터디 신청을 제출하지 못했습니다.",
        };
        await tick();
        formElement
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
        return;
      }
      issues = { _form: "스터디 신청을 제출하지 못했습니다." };
    };
  }}
>
  {#if issues._form}
    <p class="form-error" role="alert">{issues._form}</p>
  {/if}

  <div class="paper-field">
    <label class="paper-label" for="study-title">스터디 이름 <span>*</span></label>
    <input
      id="study-title"
      name="title"
      maxlength="120"
      bind:value={title}
      oninput={() => clearIssue("title")}
      aria-invalid={!!issues.title}
      placeholder="예: 범주론 입문 읽기 모임"
    />
    {#if issues.title}<p class="field-error">{issues.title}</p>{/if}
  </div>

  <div class="form-row">
    <div class="paper-field">
      <label class="paper-label" for="study-textbook">교재 또는 자료 <span>*</span></label>
      <input
        id="study-textbook"
        name="textbook"
        maxlength="240"
        bind:value={textbook}
        oninput={() => clearIssue("textbook")}
        aria-invalid={!!issues.textbook}
        placeholder="책, 논문, 강의노트 등"
      />
      {#if issues.textbook}<p class="field-error">{issues.textbook}</p>{/if}
    </div>

    <div class="paper-field">
      <label class="paper-label" for="study-semester">학기 <span>*</span></label>
      <input
        id="study-semester"
        name="semester"
        maxlength="4"
        bind:value={semester}
        oninput={() => clearIssue("semester")}
        aria-invalid={!!issues.semester}
        placeholder="26-2"
      />
      {#if issues.semester}<p class="field-error">{issues.semester}</p>{/if}
    </div>
  </div>

  <div class="paper-field">
    <label class="paper-label" for="study-description">진행 내용 <span>*</span></label>
    <textarea
      id="study-description"
      name="description"
      rows="7"
      maxlength="2400"
      bind:value={description}
      oninput={() => clearIssue("description")}
      aria-invalid={!!issues.description}
      placeholder="무엇을 공부하고 어떤 방식으로 진행할지 적어 주세요."
    ></textarea>
    {#if issues.description}<p class="field-error">{issues.description}</p>{/if}
    <p class="paper-hint">일정은 신청 단계에서 정하지 않습니다. 승인 후 실제 모임이 시작될 때 회차를 만듭니다.</p>
  </div>

  <aside>
    <strong>제출 이후</strong>
    운영진 승인 시 신청자가 주최자로 지정되고 모집 상태로 개설됩니다. 승인 전에는 신청을 철회할 수 있습니다.
  </aside>

  <div class="form-actions">
    <a href="/study" class="paper-btn">목록으로</a>
    <button class="paper-btn primary" disabled={processing}>
      {processing ? "제출 중…" : "스터디 개설 신청"}
    </button>
  </div>
</form>

<style>
  form {
    display: grid;
    gap: 1.1rem;
  }

  .paper-field {
    margin: 0;
  }

  .paper-label span {
    color: var(--latex-accent);
  }

  .form-row {
    display: grid;
    grid-template-columns: 2fr 0.7fr;
    gap: 0.9rem;
  }

  .field-error,
  .form-error {
    margin: 0.35rem 0 0;
    color: var(--latex-accent);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .form-error {
    padding: 0.6rem;
    border-left: 3px solid var(--latex-accent);
    background: color-mix(in srgb, var(--latex-accent) 5%, transparent);
  }

  aside {
    padding: 0.75rem;
    border: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.6;
  }

  aside strong {
    display: block;
    color: var(--latex-text);
  }

  .form-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--latex-rule);
  }

  @media (max-width: 640px) {
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
