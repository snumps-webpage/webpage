<script lang="ts">
  import type {
    PublicExecutive,
    PublicExecutiveRoster,
  } from "$lib/domain/members";

  let {
    roster,
    variant,
  }: {
    roster: PublicExecutiveRoster | null;
    variant: "cover" | "footer";
  } = $props();

  const executives = $derived<
    Array<{
      title: PublicExecutive["title"];
      marker: string;
      executive: PublicExecutive | null;
    }>
  >([
    { title: "회장", marker: "*", executive: roster?.president ?? null },
    {
      title: "부회장",
      marker: "†",
      executive: roster?.vicePresident ?? null,
    },
  ]);

  function phoneHref(phone: string) {
    return `tel:${phone.replace(/[^\d+]/g, "")}`;
  }
</script>

{#if variant === "cover"}
  <div class="paper-authors" aria-label="SNUMPS 운영진 공개 연락처">
    {#each executives as { title, marker, executive } (title)}
      <div class="author-entry">
        <p class="author-name">
          {executive?.name ?? "공석"}<sup>{marker}</sup>
        </p>
        <p class="author-role">{title}</p>
        {#if executive}
          <p class="author-contact">
            <a href={phoneHref(executive.phone)}>{executive.phone}</a>
          </p>
          <p class="author-contact">
            <a href={`mailto:${executive.email}`}>{executive.email}</a>
          </p>
        {:else}
          <p class="author-contact muted">공개 연락처 미등록</p>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <div class="executive-footer" aria-label="SNUMPS 운영진 공개 연락처">
    {#each executives as { title, executive }, index (title)}
      {#if index > 0}
        <span class="footer-sep" aria-hidden="true">|</span>
      {/if}
      <span class="executive-contact">
        <span class="no-sel">{title}:</span>
        <span>{executive?.name ?? "공석"}</span>
        {#if executive}
          <a href={phoneHref(executive.phone)}>{executive.phone}</a>
          <a href={`mailto:${executive.email}`}>{executive.email}</a>
        {/if}
      </span>
    {/each}
  </div>
{/if}

<style>
  .author-contact a {
    color: inherit;
    text-decoration: none;
  }

  .author-contact a:hover {
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  .author-contact.muted {
    color: var(--latex-muted, var(--text-secondary));
  }

  .executive-footer {
    display: contents;
  }

  .executive-contact {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    flex-wrap: wrap;
  }

  .executive-contact a {
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    .executive-footer {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      column-gap: 0.38rem;
      row-gap: 0.2rem;
    }

    .executive-contact {
      justify-content: center;
    }
  }
</style>
