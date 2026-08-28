<script lang="ts">
  import type { PublicDirectoryEntry } from "$lib/public-navigation";
  let { entries }: { entries: PublicDirectoryEntry[] } = $props();
</script>

<div class="directory-grid">
  {#each entries as entry, index (entry.href)}
    <a href={entry.href} class="directory-entry">
      <span class="index">{String(index + 1).padStart(2, "0")}</span>
      <div>
        <p>{entry.code}</p>
        <h2>{entry.title}</h2>
        <span>{entry.description}</span>
      </div>
      <strong class:pending={entry.status === "source-pending"}>
        {entry.status === "available" ? "열람" : "원본 대기"}
      </strong>
    </a>
  {/each}
</div>

<style>
  .directory-grid { border-top: 2px solid var(--latex-rule); border-bottom: 2px solid var(--latex-rule); }
  .directory-entry { display: grid; grid-template-columns: 2.8rem minmax(0, 1fr) auto; gap: 0.85rem; align-items: start; padding: 0.9rem 0.8rem; border-bottom: 1px solid var(--latex-rule); color: var(--latex-text); text-decoration: none; }
  .directory-entry:last-child { border-bottom: 0; }
  .directory-entry:hover { background: color-mix(in srgb, var(--latex-text) 4%, transparent); }
  .index { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; }
  p, h2, div > span { margin: 0; }
  p { color: var(--latex-accent); font-family: var(--font-mono); font-size: 0.56rem; font-weight: 700; letter-spacing: 0.08em; }
  h2 { margin-top: 0.16rem; font-size: 1.08rem; font-weight: 570; }
  div > span { display: block; max-width: 40rem; margin-top: 0.32rem; color: var(--latex-muted); font-size: 0.78rem; line-height: 1.58; }
  strong { padding: 0.18rem 0.35rem; border: 1px solid var(--latex-rule); font-family: var(--font-mono); font-size: 0.54rem; letter-spacing: 0.05em; white-space: nowrap; }
  strong.pending { border-style: dashed; color: var(--latex-muted); }
  @media (max-width: 560px) {
    .directory-entry { grid-template-columns: 2rem 1fr; }
    strong { grid-column: 2; width: fit-content; }
  }
</style>
