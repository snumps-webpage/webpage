<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryGrid from "$lib/components/public/PublicDirectoryGrid.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_DIRECTORY, ABOUT_NAV } from "$lib/public-navigation";
</script>

<svelte:head>
  <title>동아리 소개 · 서울대학교 수학문제연구회</title>
  <meta name="description" content="SNUMPS 회칙, 역대 회장단, 선거, 홍보 및 자금 자료 목록입니다." />
</svelte:head>

<article class="paper-document public-paper">
  <ManuscriptHeader title="동아리 소개" subtitle="About SNUMPS" figure={MANUSCRIPT.FIGURES.ABOUT_INDEX} />
  <PublicDirectoryNav items={[...ABOUT_NAV]} />
  <p class="abstract"><strong>Abstract.</strong> 서울대학교 수학문제연구회의 공적 문서와 임원 기록을 한 곳에서 찾을 수 있도록 구성했습니다. 정적 문서는 저장소에 버전별로 보존하고, 회장단은 회원 직책 데이터에서 파생합니다.</p>
  <PublicDirectoryGrid entries={ABOUT_DIRECTORY} />
</article>

<style>
  .public-paper { width: min(100%, 920px); }
  .abstract { margin: 0 0 1.4rem; color: var(--latex-muted); font-size: 0.88rem; line-height: 1.75; }
  .abstract strong { color: var(--latex-text); font-variant: small-caps; }
</style>
