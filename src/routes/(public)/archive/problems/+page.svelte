<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ARCHIVE_NAV } from "$lib/public-navigation";
</script>
<svelte:head><title>문제 창작 자료 · SNUMPS</title><meta name="description" content="SNUMPS 문제 창작 PDF 아카이브입니다." /></svelte:head>
<article class="paper-document static-paper"><ManuscriptHeader title="문제 창작" subtitle="Problem Writing Archive" figure={MANUSCRIPT.FIGURES.ARCHIVE_MISC} /><PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" /><SourcePendingNotice detail="명세상 이관 대상은 문제 창작 PDF 15건이지만, 현재 작업 트리에는 파일과 제목·학기 메타데이터가 없습니다. 데이터 이관 후 다운로드 목록을 제공합니다." /><a class="paper-btn back-link" href="/archive/misc">← 기타 기록</a></article>
<style>.static-paper { width: min(100%, 840px); }.back-link { margin-top: 1rem; }</style>
