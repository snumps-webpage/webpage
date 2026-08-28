<script lang="ts">
  import { signIn } from "@auth/sveltekit/client";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  let signingIn = $state(false);

  async function startGoogleSignIn() {
    if (signingIn) return;
    signingIn = true;
    try {
      await signIn("google", { redirectTo: data.redirectTo });
    } finally {
      signingIn = false;
    }
  }
</script>

<svelte:head>
  <title>로그인 · 서울대학교 수학문제연구회</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document login-paper">
  <ManuscriptHeader
    title="회원 로그인"
    subtitle="Authentication Gateway"
    figure={MANUSCRIPT.FIGURES.LOGIN}
  />

  <section class="login-sheet" aria-labelledby="login-heading">
    <p class="section-index">01 · Identity</p>
    <h1 id="login-heading">서울대학교 계정 확인</h1>
    <p class="lead">
      회원 신청, 세미나와 스터디 참여 기록은 서울대학교 Google 계정에 연결됩니다.
    </p>

    {#if data.errorMessage}
      <div class="error-note" role="alert">
        <strong>로그인할 수 없습니다.</strong>
        <span>{data.errorMessage}</span>
      </div>
    {/if}

    <button class="google-button" onclick={startGoogleSignIn} disabled={signingIn}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      <span>{signingIn ? "Google로 이동하는 중…" : "서울대학교 Google 계정으로 계속"}</span>
    </button>

    <dl class="login-notes">
      <div><dt>허용 계정</dt><dd>@snu.ac.kr</dd></div>
      <div><dt>로그인 후</dt><dd>{data.redirectTo === "/" ? "회원 대시보드" : "요청한 페이지로 복귀"}</dd></div>
    </dl>
  </section>

  <p class="privacy-note">
    인증에 성공해도 가입 승인이 완료되지 않은 계정은 가입 신청 또는 승인 대기 화면으로 이동합니다.
  </p>
</article>

<style>
  .login-paper { width: min(100%, 42rem); }
  .login-sheet { padding: clamp(1rem, 4vw, 1.75rem); border: 1px solid var(--latex-rule); }
  .section-index { margin: 0; color: var(--latex-accent); font: 700 0.6rem/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; }
  h1 { margin: 0.45rem 0 0; font-size: clamp(1.35rem, 4vw, 1.85rem); font-weight: 560; }
  .lead { margin: 0.7rem 0 1.4rem; color: var(--latex-muted); font-size: 0.88rem; line-height: 1.75; }
  .error-note { display: grid; gap: 0.2rem; margin-bottom: 1rem; padding: 0.75rem; border: 1px solid var(--color-danger-text); background: var(--color-danger-bg); color: var(--color-danger-text); font-size: 0.78rem; }
  .google-button { width: 100%; min-height: 3rem; display: flex; align-items: center; justify-content: center; gap: 0.65rem; border: 1.5px solid var(--latex-text); background: var(--latex-text); color: var(--latex-bg); font: 700 0.78rem/1.3 var(--font-sans); cursor: pointer; }
  .google-button:hover:not(:disabled) { background: transparent; color: var(--latex-text); }
  .google-button:disabled { cursor: wait; opacity: 0.65; }
  .login-notes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 1.2rem 0 0; border-top: 1px solid var(--latex-rule); }
  .login-notes div { padding-top: 0.75rem; }
  .login-notes div + div { padding-left: 0.8rem; border-left: 1px solid var(--latex-rule); }
  dt { color: var(--latex-muted); font: 700 0.57rem/1.2 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
  dd { margin: 0.25rem 0 0; font-size: 0.78rem; }
  .privacy-note { margin: 0.8rem 0 0; color: var(--latex-muted); font-size: 0.7rem; line-height: 1.6; }
  @media (max-width: 520px) { .login-notes { grid-template-columns: 1fr; } .login-notes div + div { padding-left: 0; border-left: 0; } }
</style>
