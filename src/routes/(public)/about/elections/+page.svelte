<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_NAV } from "$lib/public-navigation";
</script>
<svelte:head><title>선거 공약 · SNUMPS</title><meta name="description" content="SNUMPS 회장단 선거 양식과 역대 공약 자료입니다." /></svelte:head>
<article class="paper-document static-paper"><ManuscriptHeader title="선거 공약" subtitle="Election Materials" figure={MANUSCRIPT.FIGURES.ELECTIONS} /><PublicDirectoryNav items={[...ABOUT_NAV]} /><SourcePendingNotice detail="명세에 명시된 LaTeX 공약 양식과 역대 공약 PDF 3건이 현재 저장소와 자산 스토리지에 없습니다. 파일명, 선거 학기, 후보자 표시 범위를 함께 받은 뒤 게시합니다." /></article>
<style>.static-paper { width: min(100%, 840px); }</style>
