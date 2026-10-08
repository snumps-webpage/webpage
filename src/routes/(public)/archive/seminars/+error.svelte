<script lang="ts">
  import { page } from "$app/state";
</script>

<svelte:head><title>세미나 기록 · {page.status} · SNUMPS</title></svelte:head>
<article class="paper-document seminar-record-error">
  <p class="seminar-error-code">세미나 기록 · {page.status}</p>
  <h1>
    {page.status === 404
      ? "세미나 기록을 찾을 수 없습니다"
      : page.status === 503
        ? "기록을 잠시 불러올 수 없습니다"
        : "세미나 기록을 불러오지 못했습니다"}
  </h1>
  <p>
    {page.status === 404
      ? "주소를 확인하거나 공개 세미나 목록에서 다른 발표를 찾아주세요."
      : "잠시 후 다시 불러와 주세요. 계속 문제가 생기면 운영진에게 문의해 주세요."}
  </p>
  <div class="seminar-error-actions">
    {#if page.status !== 404}<a
        href={`${page.url.pathname}${page.url.search}`}
        data-sveltekit-reload>다시 불러오기</a
      >{/if}
    <a href="/archive/seminars">세미나 목록으로</a><a href="/archive"
      >활동 기록 보기</a
    >
  </div>
</article>

<style>
  .seminar-record-error {
    width: min(100%, 920px);
    font-family: var(--font-ui);
    border-top: 2px solid var(--latex-rule);
  }
  .seminar-error-code {
    color: var(--latex-muted);
    font-size: 0.78rem;
  }
  h1 {
    font: 550 clamp(1.5rem, 3vw, 2rem)/1.65 var(--font-display);
    margin: 0;
  }
  .seminar-record-error > p:last-of-type {
    color: var(--latex-muted);
    font-size: 0.95rem;
    line-height: 1.9;
  }
  .seminar-error-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.4rem;
    margin-top: 1rem;
    border-top: 1px solid var(--latex-rule);
    padding-top: 1rem;
  }
  a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--latex-text);
    font-size: 0.91rem;
    text-underline-offset: 0.2em;
  }
  a:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 4px;
  }
</style>
