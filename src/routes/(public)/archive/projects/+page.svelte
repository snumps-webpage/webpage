<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import PublicIndexList from "$lib/components/public/PublicIndexList.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { projectIndexItems } from "$lib/domain/public-content";
  import { ARCHIVE_NAV } from "$lib/public-navigation";
  let { data } = $props();
  const items = $derived(projectIndexItems(data.archive.projects));
</script>

<svelte:head><title>회원 프로젝트 · SNUMPS 아카이브</title><meta name="description" content="SNUMPS 회원이 공개한 수학·개발 프로젝트 목록입니다." /></svelte:head>

<article class="paper-document archive-paper">
  <ManuscriptHeader title="회원 프로젝트" subtitle="Member Project Index" figure={MANUSCRIPT.FIGURES.ARCHIVE_PROJECTS} />
  <PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" />
  <p class="scope-note">회원 레코드에 공개 프로젝트를 등록한 경우에만 표시합니다.</p>
  {#if data.dataAvailable}
    <PublicIndexList {items} searchLabel="프로젝트 검색" emptyLabel="검색 조건에 맞는 프로젝트가 없습니다." />
  {:else}<p class="empty">새 AWS 공개 회원 API 연결 후 프로젝트가 표시됩니다.</p>{/if}
</article>

<style>.archive-paper { width: min(100%, 980px); }.scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; }</style>
