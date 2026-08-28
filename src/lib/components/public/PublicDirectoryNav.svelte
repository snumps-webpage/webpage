<script lang="ts">
  type Item = { href: string; label: string };
  let { items, label = "공개 자료 탐색" }: { items: Item[]; label?: string } = $props();
</script>

<nav class="public-directory-nav" aria-label={label}>
  {#each items as item (item.href)}
    <a href={item.href}>{item.label}</a>
  {/each}
</nav>

<style>
  .public-directory-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    margin: -0.8rem 0 1.4rem;
    border: 1px solid var(--latex-rule);
  }
  a {
    flex: 1 1 8rem;
    padding: 0.55rem 0.7rem;
    border-right: 1px solid var(--latex-rule);
    color: var(--latex-text);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-align: center;
    text-decoration: none;
    text-transform: uppercase;
  }
  a:last-child { border-right: 0; }
  a:hover, a:focus-visible {
    background: var(--latex-text);
    color: var(--latex-bg);
  }
  @media (max-width: 560px) {
    a { flex-basis: 50%; border-bottom: 1px solid var(--latex-rule); }
  }
</style>
