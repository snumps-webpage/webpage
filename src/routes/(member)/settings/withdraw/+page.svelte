<script lang="ts">
  import { enhance } from "$app/forms";
  import { tick, untrack } from "svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AccountSettingsNav from "$lib/components/account/AccountSettingsNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import {
    initialWithdrawalValues,
    withdrawalFailureMessage,
    type MemberWithdrawalActionState,
  } from "$lib/domain/member-withdrawal";
  let { data, form } = $props();
  const actionForm = $derived(form as MemberWithdrawalActionState | null);
  const initial = untrack(() => initialWithdrawalValues(actionForm));
  let ackInfo = $state(initial.ackInfo),
    ackDataPolicy = $state(initial.ackDataPolicy),
    confirmName = $state(initial.confirmName);
  let submitting = $state(false);
  let transportNotice = $state<string | null>(null);
  const feedback = $derived(
    transportNotice ?? withdrawalFailureMessage(actionForm),
  );
  const hasOrganizerConflict = $derived(data.organizedStudies.length > 0);
  $effect(() => {
    if (actionForm?.operation !== "withdrawalRequested" || !actionForm.values)
      return;
    ackInfo = actionForm.values.ackInfo;
    ackDataPolicy = actionForm.values.ackDataPolicy;
    confirmName = actionForm.values.confirmName;
  });
</script>

<svelte:head
  ><title>회원 탈퇴 · SNUMPS</title><meta
    name="robots"
    content="noindex"
  /></svelte:head
>
<article class="paper-document withdraw-paper">
  <ManuscriptHeader
    title="회원 탈퇴"
    subtitle="Membership Withdrawal Protocol"
    figure={MANUSCRIPT.FIGURES.WITHDRAWAL}
  />
  <AccountSettingsNav current="withdraw" />
  <p class="intro">
    아래 세 항목을 모두 확인한 뒤 탈퇴를 신청합니다. 신청 즉시 회원 영역 접근이
    중단됩니다.
  </p>
  {#if feedback && !submitting}<p
      class="result-note"
      role="alert"
      tabindex="-1"
    >
      {feedback}
    </p>{/if}
  {#if actionForm?.error === "CONFLICT" || hasOrganizerConflict}
    <aside class="conflict-note" role="note">
      <strong>먼저 주최자를 인계해야 합니다.</strong>
      <p>진행 중인 스터디의 주최자는 바로 탈퇴할 수 없습니다.</p>
      <ul>
        {#each data.organizedStudies as study, i (i)}<li>{study}</li>{/each}
      </ul>
      <a class="paper-btn" href="/study">스터디 관리로 이동</a>
    </aside>
  {/if}
  <form
    method="POST"
    action="?/requestWithdrawal"
    class="withdraw-form"
    aria-busy={submitting}
    use:enhance={({ cancel, formElement }) => {
      if (submitting || hasOrganizerConflict) {
        cancel();
        return;
      }
      submitting = true;
      transportNotice = null;
      const article = formElement.closest("article");
      return async ({ result, update }) => {
        try {
          if (result.type === "error")
            transportNotice =
              "처리 결과를 확인하지 못했습니다. 상태가 바뀌었을 수 있으니 새로고침해 확인해 주세요.";
          else await update({ reset: false });
        } catch {
          transportNotice =
            "처리 후 상태를 불러오지 못했습니다. 새로고침해 회원 상태를 확인해 주세요.";
        } finally {
          submitting = false;
        }
        if (result.type !== "redirect") {
          await tick();
          (
            formElement.querySelector<HTMLElement>("[aria-invalid=true]") ??
            article?.querySelector<HTMLElement>("[role=alert]")
          )?.focus();
        }
      };
    }}
  >
    <fieldset class="withdraw-fields" disabled={submitting}>
      <section aria-labelledby="withdraw-access">
        <p class="section-index">01 · Access</p>
        <h2 id="withdraw-access">신청 즉시 회원 기능을 사용할 수 없습니다.</h2>
        <p>
          대시보드, 세미나, 스터디와 출석 관리 접근이 즉시 중단되고 탈퇴 처리 중
          화면으로 이동합니다.
        </p>
        <label class="check-row"
          ><input
            id="ackInfo"
            type="checkbox"
            name="ackInfo"
            required
            bind:checked={ackInfo}
            aria-invalid={actionForm?.issues?.ackInfo ? "true" : undefined}
            aria-describedby={actionForm?.issues?.ackInfo
              ? "ackInfo-error"
              : undefined}
          /><span>회원 기능 접근이 즉시 제한됨을 확인했습니다.</span></label
        >{#if actionForm?.issues?.ackInfo}<p
            class="field-error"
            id="ackInfo-error"
          >
            {actionForm.issues.ackInfo}
          </p>{/if}
      </section>
      <section aria-labelledby="withdraw-data">
        <p class="section-index">02 · Data Policy</p>
        <h2 id="withdraw-data">개인정보 처리는 1개월간 유예됩니다.</h2>
        <p>
          유예 후 회원 정보와 과거 활동 이력의 처리 범위는 임원진 정책 확정 뒤
          적용하며, 확정 전에는 자동 익명화를 실행하지 않습니다. 현재 보류
          중에는 유예 종료 후에도 본인이 탈퇴 신청을 철회할 수 있습니다.
        </p>
        <label class="check-row"
          ><input
            id="ackDataPolicy"
            type="checkbox"
            name="ackDataPolicy"
            required
            bind:checked={ackDataPolicy}
            aria-invalid={actionForm?.issues?.ackDataPolicy
              ? "true"
              : undefined}
            aria-describedby={actionForm?.issues?.ackDataPolicy
              ? "ackDataPolicy-error"
              : undefined}
          /><span
            >1개월 유예와 유예 후 처리 정책의 보류 상태를 확인했습니다.</span
          ></label
        >{#if actionForm?.issues?.ackDataPolicy}<p
            class="field-error"
            id="ackDataPolicy-error"
          >
            {actionForm.issues.ackDataPolicy}
          </p>{/if}
      </section>
      <section aria-labelledby="withdraw-identity">
        <p class="section-index">03 · Verification</p>
        <h2 id="withdraw-identity">등록된 이름을 정확히 입력해 주세요.</h2>
        <p id="name-hint">
          이 작업은 <strong>{data.memberName}</strong> 회원의 탈퇴 신청으로 기록됩니다.
        </p>
        <label class="name-field" for="confirmName"
          ><span>본인 이름</span><input
            id="confirmName"
            name="confirmName"
            required
            autocomplete="off"
            bind:value={confirmName}
            aria-invalid={actionForm?.issues?.confirmName ? "true" : undefined}
            aria-describedby={actionForm?.issues?.confirmName
              ? "name-hint confirmName-error"
              : "name-hint"}
          /></label
        >{#if actionForm?.issues?.confirmName}<p
            class="field-error"
            id="confirmName-error"
          >
            {actionForm.issues.confirmName}
          </p>{/if}
      </section>
    </fieldset>
    <div class="actions">
      <button
        type="submit"
        class="paper-btn danger"
        disabled={submitting || hasOrganizerConflict}
        >{submitting ? "탈퇴 신청 중…" : "확인 후 탈퇴 신청"}</button
      >
    </div>
    <p class="submission-note">
      두 확인 항목과 이름은 서버에서 다시 검증합니다. 신청 후 처리 중 화면에서
      상태를 확인하고 본인이 철회할 수 있습니다.
    </p>
  </form>
</article>

<style>
  .withdraw-paper {
    width: min(100%, 50rem);
  }
  .conflict-note {
    margin-bottom: 0.85rem;
    padding: 0.8rem;
    border: 1px solid var(--latex-accent);
    border-left-width: 4px;
  }
  .conflict-note p,
  .conflict-note ul {
    margin: 0.35rem 0;
    font-size: 0.76rem;
    line-height: 1.55;
  }
  .conflict-note ul {
    padding-left: 1.1rem;
  }
  .withdraw-form section {
    padding: clamp(1rem, 4vw, 1.5rem);
    border: 1px solid var(--latex-rule);
  }
  .section-index {
    margin: 0;
    color: var(--latex-accent);
    font: 700 0.58rem/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  h2 {
    margin: 0.4rem 0 0;
    font-size: clamp(1.1rem, 3.5vw, 1.42rem);
    font-weight: 560;
  }
  section > p:not(.section-index, .field-error) {
    margin: 0.65rem 0 1rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.75;
  }
  .check-row {
    display: flex;
    gap: 0.65rem;
    align-items: start;
    padding: 0.75rem;
    border: 1px solid var(--latex-rule);
    cursor: pointer;
    font-size: 0.78rem;
    line-height: 1.5;
  }
  .check-row input {
    width: 1rem;
    height: 1rem;
    margin: 0.08rem 0 0;
    accent-color: var(--latex-text);
  }
  .name-field {
    display: grid;
    gap: 0.35rem;
  }
  .name-field span {
    font: 700 0.62rem/1.2 var(--font-mono);
  }
  .name-field input {
    min-height: 2.7rem;
    padding: 0.65rem;
    border: 1px solid var(--latex-rule);
    background: transparent;
    color: var(--latex-text);
    font: inherit;
  }
  .name-field input:focus {
    outline: 2px solid var(--latex-text);
    outline-offset: 2px;
  }
  .field-error {
    margin: 0.4rem 0 0;
    color: var(--color-danger-text);
    font-size: 0.7rem;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 1.1rem;
  }
  .withdraw-fields {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .withdraw-form section + section {
    border-top: 0;
  }
  .intro,
  .submission-note {
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.7;
  }
  .result-note {
    margin: 0 0 1rem;
    padding: 0.75rem;
    border-left: 4px solid var(--color-danger-text);
    color: var(--color-danger-text);
    font-size: 0.78rem;
    line-height: 1.6;
  }
  .result-note:focus,
  .check-row input:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 3px;
  }
  .actions {
    justify-content: flex-end;
    padding: 0.85rem;
    border: 1px solid var(--latex-rule);
    margin: 0;
  }

  @media (max-width: 500px) {
    .actions {
      flex-wrap: wrap;
    }
    .actions :global(.paper-btn) {
      flex: 1;
    }
  }
</style>
