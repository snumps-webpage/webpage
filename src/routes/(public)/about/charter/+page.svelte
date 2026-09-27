<script lang="ts">
  import { page } from "$app/state";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_NAV } from "$lib/public-navigation";
  import { CHARTER, CHARTER_ENACTED } from "./charter-text";
</script>

<svelte:head
  ><title>회칙 · 서울대학교 수학문제연구회</title><meta
    name="description"
    content="서울대학교 수학문제연구회(SNUMPS) 현행 회칙 전문입니다. 9장 30조."
  /></svelte:head
>

<article class="paper-document static-paper">
  <ManuscriptHeader
    title="회칙"
    subtitle="Current Charter and Revision History"
    figure={MANUSCRIPT.FIGURES.CHARTER}
  />
  <PublicDirectoryNav items={[...ABOUT_NAV]} />

  <p class="charter-note">
    현행본 전문입니다. 제27조에 따라 {CHARTER_ENACTED} 제정 회칙을 개정한 것이며,
    개정본은
    <a href="/about/charter/history/{CHARTER_ENACTED}">이력</a>에 보존합니다.
  </p>

  <nav class="charter-toc" aria-label="장 목차">
    {#each CHARTER as chapter (chapter.no)}
      <a href="#제{chapter.no}장">제{chapter.no}장 {chapter.title}</a>
    {/each}
  </nav>

  {#each CHARTER as chapter (chapter.no)}
    <section class="chapter">
      <h2 id="제{chapter.no}장">
        <span class="ch-no">제{chapter.no}장</span>{chapter.title}
      </h2>
      {#each chapter.articles as article (article.no)}
        <section class="article">
          <h3 id="제{article.no}조">
            <span class="art-no">제{article.no}조</span>({article.title})
          </h3>
          {#each article.clauses as clause, ci (ci)}
            <p class="clause">
              {#if clause.label}<span class="cl-no">{clause.label}</span
                >{/if}{clause.text}
            </p>
            {#if clause.items}
              {#if clause.ordered}
                <ol class="items">
                  {#each clause.items as item, ii (ii)}<li>{item}</li>{/each}
                </ol>
              {:else}
                <ul class="items dashed">
                  {#each clause.items as item, ii (ii)}<li>{item}</li>{/each}
                </ul>
              {/if}
            {/if}
          {/each}
        </section>
      {/each}
    </section>
  {/each}

  {#if page.data.isAdmin}
    <!-- 문서 관리 방침은 운영 정보 — 관리자에게만 표시 -->
    <section class="document-policy">
      <h2>버전 보존 원칙</h2>
      <p>
        현행본을 갱신할 때 과거 파일을 덮어쓰지 않고 <code
          >/about/charter/history/[period]</code
        >에 개정본을 추가합니다. 원문은 <code>charter-text.ts</code>가 보관하며,
        상호참조가 어긋나 보이는 곳(제17조 ③·제23조)도 프론트엔드에서 보정하지
        않습니다 — 개정은 제27조가 정한 절차로만 이루어집니다.
      </p>
      <p class="admin-mark">이 절은 관리자에게만 표시됩니다.</p>
    </section>
  {/if}
</article>

<style>
  .static-paper {
    width: min(100%, 840px);
  }
  .charter-note {
    margin: 0 0 1rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.7;
  }
  .charter-toc {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
    margin: 0 0 1.6rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
  }
  .charter-toc a {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-decoration: none;
  }
  .charter-toc a:hover {
    color: var(--latex-text);
    text-decoration: underline;
  }
  .chapter {
    margin: 1.8rem 0 0;
  }
  .chapter h2 {
    margin: 0 0 0.9rem;
    padding-bottom: 0.35rem;
    border-bottom: 2px solid var(--latex-rule);
    font-size: 1.05rem;
    font-weight: 570;
  }
  .ch-no {
    margin-right: 0.5rem;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .article {
    margin: 0 0 1.1rem;
  }
  .article h3 {
    margin: 0 0 0.35rem;
    font-size: 0.9rem;
    font-weight: 570;
  }
  .art-no {
    margin-right: 0.4rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .clause {
    margin: 0 0 0.3rem;
    font-size: 0.85rem;
    line-height: 1.85;
    text-indent: -1.05rem;
    padding-left: 1.05rem;
  }
  .cl-no {
    margin-right: 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.78em;
  }
  .items {
    margin: 0.15rem 0 0.5rem;
    padding-left: 2.1rem;
  }
  .items li {
    font-size: 0.83rem;
    line-height: 1.8;
  }
  .items.dashed {
    list-style: none;
    padding-left: 1.5rem;
  }
  .items.dashed li::before {
    content: "—";
    margin-right: 0.45rem;
    color: var(--latex-muted);
  }
  .document-policy {
    margin-top: 1.8rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  .document-policy h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 570;
  }
  .document-policy p {
    margin: 0.4rem 0 0;
    color: var(--latex-muted);
    font-size: 0.83rem;
    line-height: 1.7;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.75em;
  }
  .admin-mark {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.62rem;
  }
</style>
