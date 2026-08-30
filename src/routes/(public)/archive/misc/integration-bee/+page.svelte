<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ARCHIVE_NAV } from "$lib/public-navigation";
</script>
<svelte:head><title>Integration Bee · SNUMPS</title><meta name="description" content="SNUMPS Integration Bee 활동 기록입니다." /></svelte:head>
<article class="paper-document static-paper"><ManuscriptHeader title="Integration Bee" subtitle="Miscellaneous Activity Record" figure={MANUSCRIPT.FIGURES.ARCHIVE_MISC} /><PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" /><SourcePendingNotice detail="Integration Bee 안내문과 결과 원본이 현재 작업 트리에 없습니다. 행사 연도·공개 범위·첨부 자산을 확정한 후 내용을 게시합니다." /><a class="paper-btn back-link" href="/archive/misc">← 기타 기록</a></article>
<style>.static-paper { width: min(100%, 840px); }.back-link { margin-top: 1rem; }</style>
