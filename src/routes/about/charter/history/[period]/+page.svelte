<script lang="ts">
  import { page } from "$app/state";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_NAV } from "$lib/public-navigation";
  const period = $derived(page.params.period);
</script>

<svelte:head><title>{period} 회칙 개정본 · SNUMPS</title></svelte:head>

<article class="paper-document history-paper">
  <ManuscriptHeader title={`${period} 회칙 개정본`} subtitle="Archived Charter Revision" figure={MANUSCRIPT.FIGURES.CHARTER} />
  <PublicDirectoryNav items={[...ABOUT_NAV]} />
  <SourcePendingNotice detail={`개정본 식별자 '${period}'에 해당하는 원문이 저장소에 제공되지 않았습니다. 확정된 파일과 메타데이터를 받은 후에만 게시합니다.`} />
  <a class="paper-btn back-link" href="/about/charter">← 현행 회칙</a>
</article>

<style>.history-paper { width: min(100%, 840px); }.back-link { margin-top: 1rem; }</style>
