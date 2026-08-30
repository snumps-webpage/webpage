<script lang="ts">
  import { enhance } from "$app/forms";
  import { untrack } from "svelte";
  import type {
    StudyOperationResult,
    StudySessionItem,
  } from "$lib/domain/studies";

  interface Props {
    session: StudySessionItem;
    onSaved: (result: StudyOperationResult) => void;
    onClose: () => void;
  }

  let { session, onSaved, onClose }: Props = $props();
  const initial = untrack(() => session);
  let dialog = $state<HTMLDialogElement>();
  let title = $state(initial.title);
  let startedAtLocal = $state(initial.startedAt.slice(0, 16));
  let issues = $state<Record<string, string>>({});
  let processing = $state(false);

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });
</script>

<dialog bind:this={dialog} onclose={onClose}>
  <form
    method="POST"
    action="?/updateSession"
    use:enhance={() => {
      processing = true;
      issues = {};
      return async ({ result }) => {
        processing = false;
        if (result.type === "success") {
          onSaved(result.data as StudyOperationResult);
          return;
        }
        if (result.type === "failure") {
          const data = result.data as { issues?: Record<string, string>; error?: string };
          issues = data.issues ?? { _form: data.error ?? "회차를 수정하지 못했습니다." };
          return;
        }
        issues = { _form: "회차를 수정하지 못했습니다." };
      };
    }}
  >
    <input type="hidden" name="sessionId" value={session.id} />
    <header>
      <p>Correction · Session {session.sessionNo}</p>
      <h2>회차 정보 정정</h2>
      <span>회차 생성에는 입력이 없으며, 이 화면은 오입력 정정에만 사용합니다.</span>
    </header>

    {#if issues._form}<p class="form-error" role="alert">{issues._form}</p>{/if}

    <div class="paper-field">
      <label class="paper-label" for={`session-title-${session.id}`}>회차 제목</label>
      <input
        id={`session-title-${session.id}`}
        name="title"
        bind:value={title}
        aria-invalid={!!issues.title}
        oninput={() => delete issues.title}
      />
      {#if issues.title}<p class="field-error">{issues.title}</p>{/if}
    </div>

    <div class="paper-field">
      <label class="paper-label" for={`session-start-${session.id}`}>시작 시각 · KST</label>
      <input
        id={`session-start-${session.id}`}
        name="startedAtLocal"
        type="datetime-local"
        bind:value={startedAtLocal}
        aria-invalid={!!issues.startedAtLocal}
        oninput={() => delete issues.startedAtLocal}
      />
      {#if issues.startedAtLocal}<p class="field-error">{issues.startedAtLocal}</p>{/if}
    </div>

    <div class="dialog-actions">
      <button type="button" class="paper-btn" disabled={processing} onclick={() => dialog?.close()}>취소</button>
      <button class="paper-btn primary" disabled={processing}>{processing ? "저장 중…" : "정정 저장"}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(94vw, 620px);
    margin: auto;
    padding: 0;
    border: 1px solid var(--latex-rule);
    border-top: 4px solid var(--latex-text);
    background: var(--latex-bg);
    color: var(--latex-text);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 42%);
    backdrop-filter: blur(2px);
  }

  form {
    display: grid;
    gap: 1rem;
    padding: 1.1rem;
  }

  header {
    padding-bottom: 0.8rem;
    border-bottom: 1px solid var(--latex-rule);
  }

  header p,
  h2,
  header span {
    margin: 0;
  }

  header p {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h2 {
    margin-top: 0.2rem;
    font-size: 1.3rem;
    font-weight: 560;
  }

  header span {
    display: block;
    margin-top: 0.35rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
  }

  .paper-field {
    margin: 0;
  }

  .field-error,
  .form-error {
    margin: 0.35rem 0 0;
    color: var(--latex-accent);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }

  @media (max-width: 520px) {
    dialog {
      width: calc(100vw - 1rem);
    }

    .dialog-actions {
      flex-direction: column-reverse;
    }
  }
</style>
