<script lang="ts">
  import SeminarArchiveIndex from "$lib/components/public/SeminarArchiveIndex.svelte";
  let { data } = $props();
</script>

<svelte:head>
  <title>세미나 기록 · SNUMPS</title>
  <meta
    name="description"
    content="SNUMPS 공개 세미나의 주제, 발표자, 일정, 선수지식과 자료를 찾아봅니다."
  />
</svelte:head>

<article class="paper-document public-seminar-list">
  <nav class="seminar-breadcrumbs" aria-label="현재 위치">
    <a href="/archive">활동 기록</a><span aria-hidden="true">/</span><span
      aria-current="page">세미나</span
    >
  </nav>
  <header class="seminar-list-heading">
    <p class="seminar-kicker">SNUMPS · 공개 기록</p>
    <h1>세미나 기록</h1>
    <p>
      공개된 발표를 주제와 발표자로 찾아보고, 소개와 공개 자료로 이어갑니다.
    </p>
  </header>
  {#if data.dataAvailable}
    <SeminarArchiveIndex records={data.archive.seminars} />
  {:else}
    <section class="seminar-list-unavailable" role="status">
      <h2>세미나 목록을 불러오지 못했습니다</h2>
      <p>기록이 없는 상태와는 다릅니다. 잠시 후 다시 불러와 주세요.</p>
      <a class="paper-btn" href="/archive/seminars" data-sveltekit-reload
        >다시 불러오기</a
      >
    </section>
  {/if}
</article>

<style>
  .public-seminar-list {
    width: min(100%, 980px);
    font-family: var(--font-ui);
  }
  .seminar-breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.7rem;
    margin: 0 0 1.1rem;
    font-size: 0.84rem;
    color: var(--latex-muted);
  }
  .seminar-breadcrumbs a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--latex-text);
    text-underline-offset: 0.2em;
  }
  .seminar-list-heading {
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    padding: 1rem 0 1.5rem;
  }
  .seminar-kicker {
    margin: 0 0 0.4rem;
    font-size: 0.76rem;
    color: var(--latex-muted);
    font-weight: 650;
  }
  h1 {
    margin: 0;
    font: 550 2.15rem/1.55 var(--font-display);
  }
  .seminar-list-heading > p:last-child {
    margin: 0.6rem 0 0;
    color: var(--latex-muted);
    font-size: 0.94rem;
    line-height: 1.85;
  }
  .seminar-list-unavailable {
    margin-top: 1.5rem;
    padding: 1rem 0;
  }
  .seminar-list-unavailable h2 {
    font: 550 1.35rem/1.6 var(--font-display);
  }
  .seminar-list-unavailable p {
    color: var(--latex-muted);
    font-size: 0.92rem;
    line-height: 1.8;
  }
  a:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 4px;
  }
  @media (max-width: 620px) {
    h1 {
      font-size: 1.85rem;
    }
  }
</style>
