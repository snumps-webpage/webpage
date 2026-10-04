<script lang="ts">
  import { enhance } from "$app/forms";
  import { signOut } from "@auth/sveltekit/client";
  import { tick } from "svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import {
    withdrawalFailureMessage,
    withdrawalTimeLabel,
    type MemberWithdrawalActionState,
  } from "$lib/domain/member-withdrawal";
  let { data, form } = $props();
  let cancelling = $state(false),
    signingOut = $state(false);
  let localNotice = $state<string | null>(null);
  const feedback = $derived(
    localNotice ??
      withdrawalFailureMessage(form as MemberWithdrawalActionState | null),
  );
  async function leaveSession() {
    if (cancelling || signingOut) return;
    signingOut = true;
    localNotice = null;
    try {
      await signOut({ redirectTo: "/" });
    } catch {
      localNotice = "로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    } finally {
      signingOut = false;
    }
  }
</script>

<svelte:head
  ><title>탈퇴 처리 중 · SNUMPS</title><meta
    name="robots"
    content="noindex"
  /></svelte:head
>
<article class="paper-document pending-paper">
  <ManuscriptHeader
    title="탈퇴 처리 중"
    subtitle="Withdrawal Grace Period"
    figure={MANUSCRIPT.FIGURES.WITHDRAWAL_PENDING}
  />
  <section class="status-sheet" aria-labelledby="withdrawal-status">
    <p class="status-code">STATUS · WITHDRAWN</p>
    <h2 id="withdrawal-status">
      {data.memberName}님의 회원 영역 접근이 중지되었습니다.
    </h2>
    <p>
      탈퇴 신청이 기록되어 있습니다. 아래에서 본인이 신청을 철회하고 직전 회원
      지위로 돌아갈 수 있습니다.
    </p>
    <dl>
      <div>
        <dt>신청 시각 · KST</dt>
        <dd>{withdrawalTimeLabel(data.state.requestedAt)}</dd>
      </div>
      <div>
        <dt>1개월 유예 기준</dt>
        <dd>{withdrawalTimeLabel(data.state.deleteAfter)}</dd>
      </div>
      <div>
        <dt>개인정보 처리</dt>
        <dd>
          {data.state.held
            ? "관리자가 보존 필요 상태로 표시함 · 자동 익명화 보류"
            : "자동 익명화 보류 · 이후 처리 정책 확정 전"}
        </dd>
      </div>
    </dl>
  </section>
  <p class="policy-note">
    현재 자동 익명화 집행은 보류되어 있습니다. 유예 기준 시각이 지난 뒤에도
    기록이 보존되고 회원 영역 접근 제한은 계속되며, 본인이 탈퇴 신청을 철회할 수
    있습니다.
  </p>
  {#if feedback && !cancelling && !signingOut}<p
      class="error-note"
      role="alert"
      tabindex="-1"
    >
      {feedback}
    </p>{/if}
  <div class="actions">
    <form
      method="POST"
      action="?/cancelWithdrawal"
      aria-busy={cancelling}
      use:enhance={({ cancel, formElement }) => {
        if (cancelling || signingOut) {
          cancel();
          return;
        }
        cancelling = true;
        localNotice = null;
        const article = formElement.closest("article");
        return async ({ result, update }) => {
          try {
            if (result.type === "error")
              localNotice =
                "처리 결과를 확인하지 못했습니다. 현재 회원 상태를 새로고침해 확인해 주세요.";
            else await update({ reset: false });
          } catch {
            localNotice =
              "처리 후 회원 상태를 불러오지 못했습니다. 새로고침해 확인해 주세요.";
          } finally {
            cancelling = false;
          }
          if (result.type !== "redirect") {
            await tick();
            article?.querySelector<HTMLElement>("[role=alert]")?.focus();
          }
        };
      }}
    >
      <button
        type="submit"
        class="paper-btn primary"
        disabled={cancelling || signingOut}
        >{cancelling ? "신청 철회 중…" : "탈퇴 신청 철회"}</button
      >
    </form>
    <button
      type="button"
      class="paper-btn"
      onclick={leaveSession}
      disabled={cancelling || signingOut}
      >{signingOut ? "로그아웃 중…" : "로그아웃"}</button
    >
  </div>
  <p class="footnote">
    * 철회하면 탈퇴 신청 직전의 준회원 또는 정회원 지위로 복원됩니다. 회원 기능
    사용 가능 여부는 이번 학기 등록 상태에도 따릅니다.
  </p>
</article>

<style>
  .pending-paper {
    width: min(100%, 46rem);
  }
  .status-sheet {
    padding: clamp(1rem, 4vw, 1.5rem);
    border: 1px solid var(--latex-rule);
    border-top-width: 4px;
  }
  .status-code {
    margin: 0;
    color: var(--latex-accent);
    font: 700 0.6rem/1 var(--font-mono);
    letter-spacing: 0.1em;
  }
  h2 {
    margin: 0.5rem 0 0;
    font-size: clamp(1.2rem, 4vw, 1.6rem);
    font-weight: 560;
  }
  .status-sheet > p:last-of-type {
    margin: 0.65rem 0 1rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.7;
  }
  dl {
    margin: 0;
    border-top: 1px solid var(--latex-rule);
  }
  dl div {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  dt {
    color: var(--latex-muted);
    font: 700 0.58rem/1.4 var(--font-mono);
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.45;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.9rem;
  }
  .error-note {
    margin: 1rem 0;
    padding: 0.7rem 0.8rem;
    border-left: 4px solid var(--color-danger-text);
    line-height: 1.6;
    color: var(--color-danger-text);
    font-size: 0.75rem;
  }
  .footnote {
    margin: 0.7rem 0 0;
    color: var(--latex-muted);
    font-size: 0.67rem;
  }
  .error-note:focus {
    outline: 2px solid var(--latex-text);
    outline-offset: 3px;
  }
  .policy-note {
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.7;
  }
  @media (max-width: 520px) {
    dl div {
      grid-template-columns: 1fr;
      gap: 0.2rem;
    }
    .actions,
    .actions form,
    .actions :global(.paper-btn) {
      width: 100%;
    }
  }
</style>
