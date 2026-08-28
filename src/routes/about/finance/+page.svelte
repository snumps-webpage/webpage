<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_NAV } from "$lib/public-navigation";
</script>
<svelte:head><title>자금 내역 · SNUMPS</title><meta name="description" content="SNUMPS 자금 내역 공개 열람 페이지입니다." /></svelte:head>
<article class="paper-document static-paper"><ManuscriptHeader title="자금 내역" subtitle="Finance Reference" figure={MANUSCRIPT.FIGURES.FINANCE} /><PublicDirectoryNav items={[...ABOUT_NAV]} /><SourcePendingNotice detail="명세는 Google Sheets 외부 링크를 공개하도록 확정했지만 현재 저장소에 확정된 열람 URL이 없습니다. 임의의 시트를 연결하지 않고 운영진이 확정한 공개 URL을 기다립니다." /></article>
<style>.static-paper { width: min(100%, 840px); }</style>
