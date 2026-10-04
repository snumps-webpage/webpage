<script lang="ts">
  import PublicRecordLinks from "$lib/components/public/PublicRecordLinks.svelte";
  import { publicRecordGroups } from "$lib/domain/public-entry";

  let { data } = $props();
  const recordsEmpty = $derived(
    data.dataAvailable &&
      data.archive.seminars.length === 0 &&
      data.archive.studies.length === 0 &&
      data.archive.activities.length === 0 &&
      data.archive.gallery.length === 0 &&
      data.archive.projects.length === 0,
  );
</script>

<svelte:head>
  <title>활동 기록 · 서울대학교 수학문제연구회</title>
  <meta
    name="description"
    content="SNUMPS의 공개 세미나, 스터디, 활동, 사진과 회원 프로젝트를 찾아봅니다."
  />
</svelte:head>

<article class="paper-document public-archive-entry">
  <header class="archive-entry-heading">
    <p class="archive-entry-kicker">SNUMPS · 공개 기록</p>
    <h1>활동 기록</h1>
    <p class="archive-entry-intro">
      세미나의 발표 주제, 스터디의 교재와 활동의 순간들을 살펴보세요. 공개된
      기록은 로그인 없이 열람할 수 있습니다.
    </p>
  </header>

  {#if !data.dataAvailable}
    <div class="archive-entry-notice" role="status">
      <p>공개 기록 목록을 불러오지 못했습니다. 잠시 후 다시 불러와 주세요.</p>
      <a href="/archive" data-sveltekit-reload>다시 불러오기</a>
      <p>아래 항목에서 각 기록의 화면으로 이동할 수 있습니다.</p>
    </div>
  {:else if recordsEmpty}
    <p class="archive-entry-notice">
      현재 공개 세미나·스터디·활동·사진·프로젝트 목록은 비어 있습니다. 각 기록의
      화면과 기타 기록 안내는 아래에서 확인할 수 있습니다.
    </p>
  {/if}

  {#each publicRecordGroups as group, index (group.title)}
    <section
      class="archive-entry-section"
      aria-labelledby={`archive-group-${index}`}
    >
      <p class="archive-section-number">
        § {String(index + 1).padStart(2, "0")}
      </p>
      <h2 id={`archive-group-${index}`}>{group.title}</h2>
      <PublicRecordLinks entries={group.links} />
    </section>
  {/each}

  <footer class="archive-entry-footer">
    <p>동아리가 궁금하다면</p>
    <a href="/about">수학문제연구회 소개 <span aria-hidden="true">→</span></a>
    <a href="/">홈으로</a>
  </footer>
</article>

<style>
  .public-archive-entry {
    width: min(100%, 980px);
    font-family: var(--font-ui);
  }
  .archive-entry-heading {
    padding: 1.1rem 0 1.8rem;
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
  }
  .archive-entry-kicker,
  .archive-section-number {
    margin: 0 0 0.5rem;
    color: var(--latex-muted);
    font-size: 0.76rem;
    font-weight: 650;
  }
  h1 {
    margin: 0;
    font: 550 clamp(1.75rem, 3.4vw, 2.3rem)/1.5 var(--font-display);
    letter-spacing: -0.025em;
  }
  .archive-entry-intro {
    margin: 0.8rem 0 0;
    max-width: 40rem;
    color: var(--latex-muted);
    font-size: 0.96rem;
    line-height: 1.9;
  }
  .archive-entry-section {
    margin-top: 2.1rem;
  }
  h2 {
    margin: 0 0 1rem;
    font: 550 1.4rem/1.6 var(--font-display);
  }
  .archive-entry-notice {
    padding: 0.75rem 1rem;
    margin: 1.4rem 0 0;
    border-left: 2px solid var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.87rem;
    line-height: 1.8;
  }
  .archive-entry-notice p {
    margin: 0;
  }
  .archive-entry-notice a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--latex-text);
    text-underline-offset: 0.25em;
  }
  .archive-entry-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.1rem 1.4rem;
    margin: 2.5rem 0 0;
    padding: 1rem 0 0;
    border-top: 1px solid var(--latex-rule);
    background: transparent;
    color: var(--latex-muted);
    font-size: 0.88rem;
  }
  .archive-entry-footer p {
    margin: 0;
  }
  .archive-entry-footer a {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    color: var(--latex-text);
    text-underline-offset: 0.25em;
  }
  a:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 4px;
  }
  @media (max-width: 560px) {
    h1 {
      font-size: 1.7rem;
    }
    h2 {
      font-size: 1.25rem;
    }
    .archive-entry-intro {
      font-size: 0.92rem;
    }
  }
</style>
