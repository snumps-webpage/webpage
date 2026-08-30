<script lang="ts">
  import { enhance } from "$app/forms";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AccountSettingsNav from "$lib/components/account/AccountSettingsNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
  let saving = $state(false);
</script>

<svelte:head>
  <title>공지 수신 설정 · SNUMPS</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document settings-paper">
  <ManuscriptHeader
    title="회원 설정"
    subtitle="Announcement Preference"
    figure={MANUSCRIPT.FIGURES.NOTIFICATIONS}
  />
  <AccountSettingsNav current="notifications" />

  {#if form?.success}
    <p class="result-note" role="status">공지 메일 설정을 저장했습니다.</p>
  {:else if form?.error}
    <p class="result-note error" role="alert">설정을 저장하지 못했습니다. 다시 시도해 주세요.</p>
  {/if}

  <section class="preference-card" aria-labelledby="announcement-heading">
    <div class="preference-copy">
      <p class="section-index">01 · Announcements</p>
      <h1 id="announcement-heading">전 회원 공지 메일</h1>
      <p>
        승인된 세미나, 확정 일정, 공개 후 일정 변경·취소와 주요 동아리 공지를 받습니다. 최신
        일정은 웹페이지에서도 확인할 수 있습니다.
      </p>
    </div>
    <div class="preference-control">
      <span class:enabled={data.account.announcementsEnabled} class="status-mark">
        {data.account.announcementsEnabled ? "수신 중" : "수신 안 함"}
      </span>
      <form
        method="POST"
        action="?/setMailPref"
        use:enhance={() => {
          saving = true;
          return async ({ update }) => {
            await update();
            saving = false;
          };
        }}
      >
        <input type="hidden" name="type" value="announcements" />
        <input type="hidden" name="enabled" value={data.account.announcementsEnabled ? "false" : "true"} />
        <button class="paper-btn" disabled={saving}>
          {saving
            ? "저장 중…"
            : data.account.announcementsEnabled
              ? "공지 메일 수신 중지"
              : "공지 메일 다시 받기"}
        </button>
      </form>
    </div>
  </section>

  <dl class="policy-grid">
    <div><dt>수신 주소</dt><dd>{data.account.email}</dd></div>
    <div><dt>적용 범위</dt><dd>전 회원 공지</dd></div>
    <div><dt>발송 방식</dt><dd>Bcc 전용</dd></div>
  </dl>
  <p class="footnote">* 가입·출석 처리처럼 계정 운영에 필요한 개별 알림은 이 설정과 별개입니다.</p>
</article>

<style>
  .settings-paper { width: min(100%, 50rem); }
  .result-note { margin: 0 0 0.8rem; padding: 0.65rem 0.75rem; border-left: 4px solid var(--latex-text); background: color-mix(in srgb, var(--latex-rule) 12%, transparent); font-size: 0.78rem; }
  .result-note.error { border-color: var(--color-danger-text); color: var(--color-danger-text); }
  .preference-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: clamp(1rem, 3vw, 1.35rem); border: 1px solid var(--latex-rule); }
  .section-index { margin: 0; color: var(--latex-accent); font: 700 0.58rem/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; }
  h1 { margin: 0.35rem 0 0; font-size: 1.22rem; font-weight: 560; }
  .preference-copy > p:last-child { max-width: 38rem; margin: 0.6rem 0 0; color: var(--latex-muted); font-size: 0.78rem; line-height: 1.7; }
  .preference-control { display: grid; justify-items: end; gap: 0.65rem; min-width: 11rem; }
  .status-mark { padding-left: 0.75rem; color: var(--latex-muted); font: 700 0.65rem/1 var(--font-mono); position: relative; }
  .status-mark::before { content: ""; position: absolute; left: 0; top: 50%; width: 0.42rem; height: 0.42rem; border: 1px solid currentColor; transform: translateY(-50%); }
  .status-mark.enabled { color: var(--latex-text); }
  .status-mark.enabled::before { background: currentColor; }
  .policy-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0.8rem 0 0; border: 1px solid var(--latex-rule); }
  .policy-grid div { min-width: 0; padding: 0.7rem; }
  .policy-grid div + div { border-left: 1px solid var(--latex-rule); }
  dt { color: var(--latex-muted); font: 700 0.55rem/1.2 var(--font-mono); letter-spacing: 0.07em; text-transform: uppercase; }
  dd { margin: 0.25rem 0 0; overflow-wrap: anywhere; font-size: 0.76rem; }
  .footnote { margin: 0.75rem 0 0; color: var(--latex-muted); font-size: 0.68rem; line-height: 1.6; }
  @media (max-width: 640px) { .preference-card { grid-template-columns: 1fr; } .preference-control { justify-items: stretch; min-width: 0; } .preference-control :global(.paper-btn) { width: 100%; } .policy-grid { grid-template-columns: 1fr; } .policy-grid div + div { border-left: 0; border-top: 1px solid var(--latex-rule); } }
</style>
