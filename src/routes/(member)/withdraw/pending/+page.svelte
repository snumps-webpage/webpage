<script lang="ts">
  import { enhance } from "$app/forms";
  import { signOut } from "@auth/sveltekit/client";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
  let cancelling = $state(false);

  function dateTime(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }).format(new Date(value));
  }
</script>

<svelte:head>
  <title>탈퇴 처리 중 · SNUMPS</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document pending-paper">
  <ManuscriptHeader
    title="탈퇴 처리 중"
    subtitle="Withdrawal Grace Period"
    figure={MANUSCRIPT.FIGURES.WITHDRAWAL_PENDING}
  />

  <section class="status-sheet">
    <p class="status-code">STATUS · WITHDRAWN</p>
    <h1>{data.memberName}님의 회원 기능이 중지되었습니다.</h1>
    <p>유예 기간 안에는 아래 버튼으로 탈퇴 신청을 철회하고 기존 지위로 돌아갈 수 있습니다.</p>

    <dl>
      <div><dt>신청 시각</dt><dd>{dateTime(data.state.requestedAt)}</dd></div>
      <div>
        <dt>개인정보 처리</dt>
        <dd>
          {data.state.held
            ? "관리자가 보존 필요 상태로 표시함"
            : `${dateTime(data.state.deleteAfter)}에 유예 종료 · 이후 처리 정책은 확정 전`}
        </dd>
      </div>
    </dl>
  </section>

  {#if form?.error}
    <p class="error-note" role="alert">이미 처리되었거나 철회할 수 없는 신청입니다.</p>
  {/if}

  <div class="actions">
    <form
      method="POST"
      action="?/cancelWithdrawal"
      use:enhance={() => {
        cancelling = true;
        return async ({ update }) => {
          await update();
          cancelling = false;
        };
      }}
    >
      <button class="paper-btn primary" disabled={cancelling}>
        {cancelling ? "복원 중…" : "탈퇴 신청 철회"}
      </button>
    </form>
    <button class="paper-btn" onclick={() => signOut({ redirectTo: "/" })}>로그아웃</button>
  </div>
  <p class="footnote">* 철회하면 탈퇴 신청 직전의 준회원 또는 정회원 지위로 복원됩니다.</p>
</article>

<style>
  .pending-paper { width: min(100%, 46rem); }
  .status-sheet { padding: clamp(1rem, 4vw, 1.5rem); border: 1px solid var(--latex-rule); border-top-width: 4px; }
  .status-code { margin: 0; color: var(--latex-accent); font: 700 0.6rem/1 var(--font-mono); letter-spacing: 0.1em; }
  h1 { margin: 0.5rem 0 0; font-size: clamp(1.2rem, 4vw, 1.6rem); font-weight: 560; }
  .status-sheet > p:last-of-type { margin: 0.65rem 0 1rem; color: var(--latex-muted); font-size: 0.8rem; line-height: 1.7; }
  dl { margin: 0; border-top: 1px solid var(--latex-rule); }
  dl div { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: 0.75rem; padding: 0.65rem 0; border-bottom: 1px solid var(--latex-rule); }
  dt { color: var(--latex-muted); font: 700 0.58rem/1.4 var(--font-mono); text-transform: uppercase; }
  dd { margin: 0; font-size: 0.76rem; line-height: 1.45; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.9rem; }
  .error-note { color: var(--color-danger-text); font-size: 0.75rem; }
  .footnote { margin: 0.7rem 0 0; color: var(--latex-muted); font-size: 0.67rem; }
  @media (max-width: 520px) { dl div { grid-template-columns: 1fr; gap: 0.2rem; } .actions, .actions form, .actions :global(.paper-btn) { width: 100%; } }
</style>
