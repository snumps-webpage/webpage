<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ARCHIVE_NAV } from "$lib/public-navigation";
</script>
<svelte:head><title>채팅방 논의 자료 · SNUMPS</title><meta name="description" content="SNUMPS 수학 논의 PDF 아카이브입니다." /></svelte:head>
<article class="paper-document static-paper"><ManuscriptHeader title="채팅방 논의" subtitle="Discussion Archive" figure={MANUSCRIPT.FIGURES.ARCHIVE_MISC} /><PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" /><SourcePendingNotice detail="명세상 이관 대상은 채팅방 논의 PDF 3건이지만, 현재 작업 트리에 원본과 공개 범위 메타데이터가 없습니다. 개인 정보를 검토한 확정본만 게시합니다." /><a class="paper-btn back-link" href="/archive/misc">← 기타 기록</a></article>
<style>.static-paper { width: min(100%, 840px); }.back-link { margin-top: 1rem; }</style>
