<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_NAV } from "$lib/public-navigation";

  let { data } = $props();

  function termLabel(term: string) {
    const [year, semester] = term.split("-");
    const semesterLabel = { "1": "1학기", "2": "2학기", W: "겨울", S: "여름" }[
      semester
    ] ?? semester;
    return `20${year}년 ${semesterLabel}`;
  }
</script>

<svelte:head>
  <title>역대 회장단 · 서울대학교 수학문제연구회</title>
  <meta
    name="description"
    content="서울대학교 수학문제연구회의 학기별 회장과 부회장 기록입니다."
  />
</svelte:head>

<article class="paper-document executive-history-paper">
  <ManuscriptHeader
    title="역대 회장단"
    subtitle="Executive History"
    figure={MANUSCRIPT.FIGURES.PUBLIC_EXECUTIVES}
  />
  <PublicDirectoryNav items={[...ABOUT_NAV]} />

  <div class="intro-row">
    <p>학기별 직책 기록에서 회장·부회장만 파생합니다. 공개 동의된 연락처는 현 회장단에만 표시됩니다.</p>
    <a class="paper-btn" href="/members">전체 회원 명단</a>
  </div>

  {#if data.dataAvailable}
    <div class="history-list">
      {#each data.history as term, termIndex (term.term)}
        <section class:current-term={termIndex === 0} class="term-section">
          <header>
            <div><span>{term.term}</span><h2>{termLabel(term.term)}</h2></div>
            {#if termIndex === 0}<strong>Current</strong>{/if}
          </header>
          <div class="executive-grid">
            {#each term.executives as executive (`${executive.id}-${executive.title}`)}
              <article class="executive-card">
                <p>{executive.title}</p>
                <h3>{executive.name}</h3>
                <span>{executive.department}</span>
                {#if executive.contact}
                  <div class="contact-block">
                    <a href={`tel:${executive.contact.phone.replace(/[^\d+]/g, "")}`}>
                      {executive.contact.phone}
                    </a>
                    <a href={`mailto:${executive.contact.email}`}>{executive.contact.email}</a>
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        </section>
      {:else}
        <p class="empty-state">등록된 회장단 기록이 없습니다.</p>
      {/each}
    </div>
  {:else}
    <p class="empty-state">새 AWS 공개 임원 API 연결 후 기록이 표시됩니다.</p>
  {/if}
</article>

<style>
  .executive-history-paper { width: min(100%, 920px); }
  .intro-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--latex-rule); }
  .intro-row p { max-width: 40rem; margin: 0; color: var(--latex-muted); font-size: 0.82rem; line-height: 1.65; }
  .history-list { display: grid; gap: 0.85rem; }
  .term-section { border: 1px solid var(--latex-rule); }
  .term-section.current-term { border-top: 3px solid var(--latex-text); }
  .term-section > header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 0.8rem; border-bottom: 1px solid var(--latex-rule); }
  .term-section header span, .term-section header strong { color: var(--latex-accent); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .term-section h2 { margin: 0.14rem 0 0; font-size: 1.06rem; font-weight: 570; }
  .executive-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .executive-card { min-width: 0; padding: 0.85rem; border-right: 1px solid var(--latex-rule); }
  .executive-card:nth-child(2n) { border-right: 0; }
  .executive-card p, .executive-card h3, .executive-card > span { margin: 0; }
  .executive-card p { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; text-transform: uppercase; }
  .executive-card h3 { margin-top: 0.25rem; font-size: 1.1rem; font-weight: 570; }
  .executive-card > span { display: block; margin-top: 0.12rem; color: var(--latex-muted); font-size: 0.72rem; }
  .contact-block { display: grid; gap: 0.18rem; margin-top: 0.65rem; padding-top: 0.55rem; border-top: 1px solid var(--latex-rule); }
  .contact-block a { width: fit-content; max-width: 100%; color: var(--latex-text); font-family: var(--font-mono); font-size: 0.68rem; overflow-wrap: anywhere; text-underline-offset: 0.16em; }
  .empty-state { margin: 0; padding: 1.5rem; border: 1px dashed var(--latex-rule); color: var(--latex-muted); text-align: center; }
  @media (max-width: 680px) {
    .intro-row { align-items: stretch; flex-direction: column; }
    .intro-row a { width: 100%; }
  }
  @media (max-width: 500px) {
    .executive-grid { grid-template-columns: 1fr; }
    .executive-card { border-right: 0; border-bottom: 1px solid var(--latex-rule); }
    .executive-card:last-child { border-bottom: 0; }
  }
</style>
