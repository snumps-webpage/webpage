<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AccountSettingsNav from "$lib/components/account/AccountSettingsNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import type { WithdrawalFormFailure } from "$lib/domain/account";

  let { data, form } = $props();
  let step = $state(1);
  let ackInfo = $state(false);
  let ackDataPolicy = $state(false);
  let confirmName = $state("");

  type WithdrawalActionData = {
    error?: string;
    issues?: WithdrawalFormFailure["issues"];
    values?: WithdrawalFormFailure["values"];
    organizedStudies?: string[];
  };
  const actionForm = $derived(form as WithdrawalActionData | null);

  $effect(() => {
    if (!actionForm?.values) return;
    ackInfo = actionForm.values.ackInfo;
    ackDataPolicy = actionForm.values.ackDataPolicy;
    confirmName = actionForm.values.confirmName;
  });

  const hasOrganizerConflict = $derived(data.organizedStudies.length > 0);
</script>

<svelte:head>
  <title>회원 탈퇴 · SNUMPS</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document withdraw-paper">
  <ManuscriptHeader
    title="회원 탈퇴"
    subtitle="Membership Withdrawal Protocol"
    figure={MANUSCRIPT.FIGURES.WITHDRAWAL}
  />
  <AccountSettingsNav current="withdraw" />

  <ol class="step-index" aria-label="탈퇴 확인 단계">
    <li class:current={step === 1} class:done={step > 1}>1. 접근 제한</li>
    <li class:current={step === 2} class:done={step > 2}>2. 데이터 처리</li>
    <li class:current={step === 3}>3. 본인 확인</li>
  </ol>

  {#if actionForm?.error === "STUDY_ORGANIZER_CONFLICT" || hasOrganizerConflict}
    <aside class="conflict-note" role="note">
      <strong>먼저 주최자를 전달해야 합니다.</strong>
      <p>진행 중인 스터디의 주최자는 바로 탈퇴할 수 없습니다.</p>
      <ul>
        {#each actionForm?.organizedStudies ?? data.organizedStudies as study (study)}
          <li>{study}</li>
        {/each}
      </ul>
      <a class="paper-btn" href="/study">스터디 관리로 이동</a>
    </aside>
  {/if}

  <form method="POST" action="?/requestWithdrawal" class="withdraw-form">
    <section class:hidden={step !== 1} aria-labelledby="withdraw-step-1">
      <p class="section-index">01 · Access</p>
      <h1 id="withdraw-step-1">신청 즉시 회원 기능을 사용할 수 없습니다.</h1>
      <p>대시보드, 세미나, 스터디와 출석 관리 접근이 즉시 중단되고 탈퇴 처리 중 화면으로 이동합니다.</p>
      <label class="check-row">
        <input type="checkbox" name="ackInfo" bind:checked={ackInfo} />
        <span>회원 기능 접근이 즉시 제한됨을 확인했습니다.</span>
      </label>
      {#if actionForm?.issues?.ackInfo}<p class="field-error">{actionForm.issues.ackInfo}</p>{/if}
      <div class="actions end"><button type="button" class="paper-btn primary" disabled={!ackInfo} onclick={() => (step = 2)}>다음</button></div>
    </section>

    <section class:hidden={step !== 2} aria-labelledby="withdraw-step-2">
      <p class="section-index">02 · Data policy</p>
      <h1 id="withdraw-step-2">개인정보 처리는 1개월간 유예됩니다.</h1>
      <p>유예 기간에는 신청을 철회할 수 있습니다. 유예 후 회원 정보와 과거 활동 이력의 처리 범위는 임원진 정책 확정 뒤 적용하며, 확정 전에는 자동 익명화를 실행하지 않습니다.</p>
      <label class="check-row">
        <input type="checkbox" name="ackDataPolicy" bind:checked={ackDataPolicy} />
        <span>1개월 유예와 유예 후 처리 정책의 보류 상태를 확인했습니다.</span>
      </label>
      {#if actionForm?.issues?.ackDataPolicy}<p class="field-error">{actionForm.issues.ackDataPolicy}</p>{/if}
      <div class="actions"><button type="button" class="paper-btn" onclick={() => (step = 1)}>이전</button><button type="button" class="paper-btn primary" disabled={!ackDataPolicy} onclick={() => (step = 3)}>다음</button></div>
    </section>

    <section class:hidden={step !== 3} aria-labelledby="withdraw-step-3">
      <p class="section-index">03 · Verification</p>
      <h1 id="withdraw-step-3">등록된 이름을 정확히 입력해 주세요.</h1>
      <p>이 작업은 <strong>{data.memberName}</strong> 회원의 탈퇴 신청으로 기록됩니다.</p>
      <label class="name-field" for="confirmName">
        <span>본인 이름</span>
        <input id="confirmName" name="confirmName" autocomplete="off" bind:value={confirmName} aria-invalid={actionForm?.issues?.confirmName ? "true" : undefined} />
      </label>
      {#if actionForm?.issues?.confirmName}<p class="field-error">{actionForm.issues.confirmName}</p>{/if}
      <div class="actions"><button type="button" class="paper-btn" onclick={() => (step = 2)}>이전</button><button class="paper-btn danger" disabled={confirmName !== data.memberName || hasOrganizerConflict}>탈퇴 신청 확정</button></div>
    </section>
  </form>
</article>

<style>
  .withdraw-paper { width: min(100%, 50rem); }
  .step-index { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0 0 0.85rem; padding: 0; border: 1px solid var(--latex-rule); list-style: none; }
  .step-index li { padding: 0.6rem; color: var(--latex-muted); font: 700 0.58rem/1.2 var(--font-mono); text-align: center; }
  .step-index li + li { border-left: 1px solid var(--latex-rule); }
  .step-index li.current { background: var(--latex-text); color: var(--latex-bg); }
  .step-index li.done { color: var(--latex-text); text-decoration: line-through; }
  .conflict-note { margin-bottom: 0.85rem; padding: 0.8rem; border: 1px solid var(--latex-accent); border-left-width: 4px; }
  .conflict-note p, .conflict-note ul { margin: 0.35rem 0; font-size: 0.76rem; line-height: 1.55; }
  .conflict-note ul { padding-left: 1.1rem; }
  .withdraw-form section { padding: clamp(1rem, 4vw, 1.5rem); border: 1px solid var(--latex-rule); }
  .withdraw-form section.hidden { display: none; }
  .section-index { margin: 0; color: var(--latex-accent); font: 700 0.58rem/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; }
  h1 { margin: 0.4rem 0 0; font-size: clamp(1.1rem, 3.5vw, 1.42rem); font-weight: 560; }
  section > p:not(.section-index, .field-error) { margin: 0.65rem 0 1rem; color: var(--latex-muted); font-size: 0.8rem; line-height: 1.75; }
  .check-row { display: flex; gap: 0.65rem; align-items: start; padding: 0.75rem; border: 1px solid var(--latex-rule); cursor: pointer; font-size: 0.78rem; line-height: 1.5; }
  .check-row input { width: 1rem; height: 1rem; margin: 0.08rem 0 0; accent-color: var(--latex-text); }
  .name-field { display: grid; gap: 0.35rem; }
  .name-field span { font: 700 0.62rem/1.2 var(--font-mono); }
  .name-field input { min-height: 2.7rem; padding: 0.65rem; border: 1px solid var(--latex-rule); background: transparent; color: var(--latex-text); font: inherit; }
  .name-field input:focus { outline: 2px solid var(--latex-text); outline-offset: 2px; }
  .field-error { margin: 0.4rem 0 0; color: var(--color-danger-text); font-size: 0.7rem; }
  .actions { display: flex; justify-content: space-between; gap: 0.6rem; margin-top: 1.1rem; }
  .actions.end { justify-content: flex-end; }
  :global(.paper-btn.danger) { border-color: var(--color-danger-text); color: var(--color-danger-text); }
  :global(.paper-btn.danger:hover:not(:disabled)) { background: var(--color-danger-text); color: var(--latex-bg); }
  @media (max-width: 500px) { .step-index li { padding-inline: 0.3rem; font-size: 0.52rem; } .actions { flex-wrap: wrap; } .actions :global(.paper-btn) { flex: 1; } }
</style>
