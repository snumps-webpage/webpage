<script lang="ts">
  import { filterPublicIndex, type PublicIndexItem } from "$lib/domain/public-content";

  let {
    items,
    searchLabel = "기록 검색",
    emptyLabel = "해당하는 공개 기록이 없습니다.",
  }: {
    items: PublicIndexItem[];
    searchLabel?: string;
    emptyLabel?: string;
  } = $props();

  let query = $state("");
  const filtered = $derived(filterPublicIndex(items, query));
</script>

<section class="index-tools">
  <label class="paper-label" for="public-index-search">{searchLabel}</label>
  <div class="search-row">
    <input id="public-index-search" type="search" bind:value={query} placeholder="제목, 학기, 이름 또는 핵심어" />
    <span aria-live="polite">{filtered.length} / {items.length}</span>
  </div>
</section>

<div class="index-list">
  {#each filtered as item, index (item.id)}
    <article class="index-entry">
      <div class="entry-number">{String(index + 1).padStart(2, "0")}</div>
      <div class="entry-body">
        <p class="eyebrow">{item.eyebrow}</p>
        <h2>
          {#if item.href}
            <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}>{item.title}</a>
          {:else}
            {item.title}
          {/if}
        </h2>
        <p class="description">{item.description}</p>
        {#if item.metadata.length}
          <ul class="metadata">
            {#each item.metadata as value (value)}<li>{value}</li>{/each}
          </ul>
        {/if}
      </div>
    </article>
  {:else}
    <p class="empty">{emptyLabel}</p>
  {/each}
</div>

<style>
  .index-tools { margin-bottom: 0.9rem; padding: 0.8rem; border: 1px solid var(--latex-rule); }
  .search-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0.7rem; }
  input { width: 100%; min-width: 0; padding: 0.65rem 0.7rem; }
  .search-row span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700; }
  .index-list { border-top: 2px solid var(--latex-rule); border-bottom: 2px solid var(--latex-rule); }
  .index-entry { display: grid; grid-template-columns: 3rem 1fr; border-bottom: 1px solid var(--latex-rule); }
  .index-entry:last-child { border-bottom: 0; }
  .entry-number { padding: 0.9rem 0.65rem; border-right: 1px solid var(--latex-rule); color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; text-align: center; }
  .entry-body { min-width: 0; padding: 0.85rem 0.95rem 0.95rem; }
  .eyebrow { margin: 0; color: var(--latex-accent); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  h2 { margin: 0.18rem 0 0; font-size: 1.14rem; font-weight: 570; line-height: 1.35; }
  h2 a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  .description { max-width: 46rem; margin: 0.42rem 0 0; color: var(--latex-muted); font-size: 0.82rem; line-height: 1.65; }
  .metadata { display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; margin: 0.55rem 0 0; padding: 0; list-style: none; }
  .metadata li { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.6rem; }
  .metadata li::before { content: "·"; margin-right: 0.35rem; }
  .empty { margin: 0.8rem 0; }
  @media (max-width: 480px) {
    .index-entry { grid-template-columns: 2.3rem 1fr; }
    .entry-number { padding-inline: 0.35rem; }
    .entry-body { padding-inline: 0.75rem; }
  }
</style>
