<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import PublicIndexList from "$lib/components/public/PublicIndexList.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { seminarIndexItems } from "$lib/domain/public-content";
  import { ARCHIVE_NAV } from "$lib/public-navigation";

  let { data } = $props();
  const items = $derived(seminarIndexItems(data.archive.seminars));
</script>

<svelte:head>
  <title>세미나 기록 · SNUMPS 아카이브</title>
  <meta name="description" content="SNUMPS 세미나의 제목, 발표자, 선수지식, 일정과 공개 자료 목록입니다." />
</svelte:head>

<article class="paper-document archive-paper">
  <ManuscriptHeader title="세미나 기록" subtitle="Seminar Archive" figure={MANUSCRIPT.FIGURES.ARCHIVE_SEMINARS} />
  <PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" />
  <p class="scope-note">일정까지 공개된 세미나 기록만 표시합니다. 신청자 정보와 출석자 명단은 포함하지 않습니다.</p>
  {#if data.dataAvailable}
    <PublicIndexList {items} searchLabel="세미나 검색" emptyLabel="검색 조건에 맞는 세미나가 없습니다." />
  {:else}
    <p class="empty">새 AWS 공개 세미나 API 연결 후 기록이 표시됩니다.</p>
  {/if}
</article>

<style>
  .archive-paper { width: min(100%, 980px); }
  .scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; }
</style>
