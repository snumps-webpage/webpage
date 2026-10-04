<script lang="ts">
  import type { PublicRecordLink } from "$lib/domain/public-entry";
  let { entries }: { entries: PublicRecordLink[] } = $props();
</script>

<ul class="public-record-links">
  {#each entries as entry (entry.href)}
    <li>
      <a href={entry.href}>
        <span class="record-copy">
          <strong>{entry.title}</strong>
          <span>{entry.description}</span>
        </span>
        <span class="record-direction" aria-hidden="true">↗</span>
      </a>
    </li>
  {/each}
</ul>

<style>
  .public-record-links {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--latex-rule);
  }
  li {
    border-bottom: 1px solid var(--latex-rule);
  }
  a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.25rem;
    min-height: 88px;
    padding: 1.1rem 0.35rem;
    color: var(--latex-text);
    text-decoration: none;
  }
  .record-copy {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  strong {
    font: 550 1.18rem/1.5 var(--font-display);
  }
  .record-copy > span {
    color: var(--latex-muted);
    font: 0.88rem/1.7 var(--font-ui);
    overflow-wrap: anywhere;
  }
  .record-direction {
    flex: 0 0 auto;
    font: 1.35rem/1 var(--font-ui);
  }
  a:hover strong {
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }
  a:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 4px;
  }
  @media (max-width: 560px) {
    a {
      gap: 0.8rem;
      padding: 1rem 0.2rem;
    }
    strong {
      font-size: 1.1rem;
    }
  }
</style>
