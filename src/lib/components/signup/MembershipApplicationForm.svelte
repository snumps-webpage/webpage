<script lang="ts">
  import { enhance } from "$app/forms";
  import { tick, untrack } from "svelte";
  import { actionErrorText } from "$lib/domain/api";
  import type {
    MembershipActionState,
    MembershipFormValues,
  } from "$lib/domain/membership-onboarding";
  import SignupMetadataFields from "./SignupMetadataFields.svelte";
  import SignupContactFields from "./SignupContactFields.svelte";
  import SignupConsentField from "./SignupConsentField.svelte";
  let {
    mode,
    account,
    initialValues,
    form = null,
    preview = false,
  }: {
    mode: "create" | "edit";
    account: { name: string; department: string; email: string };
    initialValues?: Partial<MembershipFormValues>;
    form?: MembershipActionState | null;
    preview?: boolean;
  } = $props();
  const starting = untrack(() => ({
    ...initialValues,
    ...(form?.operation === "applicationWithdrawn" ? {} : form?.values),
  }));
  let phone = $state(starting.phone ?? "");
  let studentId = $state(starting.studentId ?? "");
  let background = $state(starting.background ?? "");
  let accepted = $state(starting.agreement === "on");
  let processing = $state(false);
  let formElement = $state<HTMLFormElement>();
  const issues = $derived(
    form?.operation === "applicationWithdrawn" ? {} : (form?.issues ?? {}),
  );
  const error = $derived(
    form?.operation !== "applicationWithdrawn" && form?.error
      ? actionErrorText(
          form,
          "신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        )
      : null,
  );
</script>

{#if form?.success && form.operation !== "applicationWithdrawn"}
  <section
    class="membership-receipt"
    role="status"
    aria-labelledby="membership-receipt-heading"
  >
    <p class="receipt-label">
      {mode === "create" ? "접수 완료 · 검토 중" : "수정 저장 완료"}
    </p>
    <h2 id="membership-receipt-heading">
      {mode === "create"
        ? "가입 신청을 접수했습니다"
        : "신청 내용을 저장했습니다"}
    </h2>
    <p>
      {mode === "create"
        ? "운영진이 가입 신청을 검토하고 있습니다. 대기 화면에서 저장된 내용과 현재 상태를 확인할 수 있습니다."
        : "저장한 신청 정보로 운영진 검토가 이어집니다. 대기 화면에서 변경한 내용을 확인해 주세요."}
    </p>
    <div class="paper-actions">
      <a href="/wait" class="paper-btn primary">가입 승인 대기 화면</a><a
        href="/signup/edit"
        class="paper-btn">저장한 신청 수정</a
      >
    </div>
  </section>
{:else}
  <form
    class="membership-form"
    bind:this={formElement}
    method="POST"
    aria-busy={processing}
    use:enhance={({ cancel }) => {
      if (processing || preview) {
        cancel();
        return;
      }
      processing = true;
      return async ({ update }) => {
        try {
          await update({ reset: false });
        } finally {
          processing = false;
        }
        await tick();
        const invalid = formElement?.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        );
        (
          invalid ?? formElement?.querySelector<HTMLElement>('[role="alert"]')
        )?.focus();
      };
    }}
  >
    {#if error}<p class="paper-status-note error" role="alert" tabindex="-1">
        {error}
      </p>{/if}
    {#if preview}<p class="preview-note">
        개발 미리보기입니다. 이 화면에서는 신청을 저장하지 않습니다.
      </p>{/if}
    <fieldset class="membership-fields" disabled={processing || preview}>
      <legend class="sr-only">회원 신청 정보</legend>
      <ol class="paper-sections">
        <SignupMetadataFields
          name={account.name}
          department={account.department}
          email={account.email}
        /><SignupContactFields
          bind:phone
          bind:studentId
          bind:background
          {issues}
        />{#if mode === "create"}<SignupConsentField
            bind:accepted
            error={issues.agreement ?? ""}
          />{/if}
      </ol>
    </fieldset>
    <p class="submission-note">
      {mode === "create"
        ? "제출 후에는 운영진 승인 전까지 신청 정보를 수정하거나 대기 화면에서 신청을 철회할 수 있습니다."
        : "수정 내용은 저장 버튼을 눌러야 반영됩니다."}
    </p>
    <div class="paper-actions">
      <a href={mode === "create" ? "/" : "/wait"} class="paper-btn secondary"
        >{mode === "create" ? "홈으로" : "저장하지 않고 대기 화면"}</a
      ><button
        type="submit"
        class="paper-btn primary"
        disabled={processing || preview}
        >{processing
          ? "신청 처리 중…"
          : mode === "create"
            ? "가입 신청 제출"
            : "수정 내용 저장"}</button
      >
    </div>
  </form>
{/if}

<style>
  .membership-fields {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .preview-note,
  .submission-note {
    color: var(--latex-muted);
    font-size: 0.83rem;
  }
  .submission-note {
    margin: 1.25rem 0;
  }
  .membership-receipt {
    padding: 0.6rem 0;
  }
  .receipt-label {
    margin: 0;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  .membership-receipt h2 {
    margin: 0.4rem 0 1rem;
    font-size: 1.4rem;
    font-weight: 550;
  }
  .membership-receipt > p:not(.receipt-label) {
    color: var(--latex-muted);
    font-size: 0.9rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .membership-fields :global([aria-invalid="true"]) {
    border-left: 3px solid var(--latex-accent);
  }
</style>
