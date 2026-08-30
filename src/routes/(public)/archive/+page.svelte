<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryGrid from "$lib/components/public/PublicDirectoryGrid.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ARCHIVE_DIRECTORY, ARCHIVE_NAV } from "$lib/public-navigation";
</script>

<svelte:head>
  <title>활동 아카이브 · 서울대학교 수학문제연구회</title>
  <meta name="description" content="SNUMPS 세미나, 스터디, 활동, 갤러리와 프로젝트 기록입니다." />
</svelte:head>

<article class="paper-document public-paper">
  <ManuscriptHeader title="활동 아카이브" subtitle="Public Activity Archive" figure={MANUSCRIPT.FIGURES.ARCHIVE_INDEX} />
  <PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" />
  <p class="abstract"><strong>Abstract.</strong> 기존 활동 이력을 유지하면서 세미나·스터디·문제 창작·문제 풀이 등의 기록을 공개 전용 DTO로 표시합니다. 참석자 ID와 운영 상태는 공개 응답에 포함하지 않습니다.</p>
  <PublicDirectoryGrid entries={ARCHIVE_DIRECTORY} />
</article>

<style>
  .public-paper { width: min(100%, 920px); }
  .abstract { margin: 0 0 1.4rem; color: var(--latex-muted); font-size: 0.88rem; line-height: 1.75; }
  .abstract strong { color: var(--latex-text); font-variant: small-caps; }
</style>
