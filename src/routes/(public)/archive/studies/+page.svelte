<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import PublicIndexList from "$lib/components/public/PublicIndexList.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { studyIndexItems } from "$lib/domain/public-content";
  import { ARCHIVE_NAV } from "$lib/public-navigation";
  let { data } = $props();
  const items = $derived(studyIndexItems(data.archive.studies));
</script>

<svelte:head><title>스터디 기록 · SNUMPS 아카이브</title><meta name="description" content="SNUMPS 스터디의 분야, 교재, 설명과 공개 자료 목록입니다." /></svelte:head>

<article class="paper-document archive-paper">
  <ManuscriptHeader title="스터디 기록" subtitle="Study Archive" figure={MANUSCRIPT.FIGURES.ARCHIVE_STUDIES} />
  <PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" />
  <p class="scope-note">운영자 전달 제안, 참여 대기 명단, 출석자 ID는 공개 응답에서 제외합니다.</p>
  {#if data.dataAvailable}
    <PublicIndexList {items} searchLabel="스터디 검색" emptyLabel="검색 조건에 맞는 스터디가 없습니다." />
  {:else}<p class="empty">데이터 이관 후 기록이 표시됩니다.</p>{/if}
</article>

<style>.archive-paper { width: min(100%, 980px); }.scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; }</style>
