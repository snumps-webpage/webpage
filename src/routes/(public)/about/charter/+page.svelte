<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_NAV } from "$lib/public-navigation";
</script>

<svelte:head><title>회칙 · 서울대학교 수학문제연구회</title><meta name="description" content="SNUMPS 현행 회칙과 개정 이력 열람 페이지입니다." /></svelte:head>

<article class="paper-document static-paper">
  <ManuscriptHeader title="회칙" subtitle="Current Charter and Revision History" figure={MANUSCRIPT.FIGURES.CHARTER} />
  <PublicDirectoryNav items={[...ABOUT_NAV]} />
  <SourcePendingNotice detail="명세에서는 현행 회칙과 과거 개정본 2건을 저장소의 정적 문서로 관리하도록 확정했으나, 현재 작업 트리에는 조문 원문과 개정 시점 식별자가 없습니다. 원본을 전달받으면 조문 번호를 보존해 연결합니다." />
  <section class="document-policy"><h2>1. 버전 보존 원칙</h2><p>현행본을 갱신할 때 과거 파일을 덮어쓰지 않고, <code>/about/charter/history/[period]</code>에 개정본을 추가합니다.</p></section>
  <section class="document-policy"><h2>2. 현재 상태</h2><p>회칙 콘텐츠 정비는 명세상 보류 항목입니다. 신규 개정본을 받기 전까지 제8조 부재 등 내용 문제를 프론트엔드에서 보정하지 않습니다.</p></section>
</article>

<style>.static-paper { width: min(100%, 840px); }.document-policy { margin-top: 1.2rem; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }.document-policy h2 { margin: 0; font-size: 1rem; font-weight: 570; }.document-policy p { margin: 0.4rem 0 0; color: var(--latex-muted); font-size: 0.83rem; line-height: 1.7; }code { font-family: var(--font-mono); font-size: 0.75em; }</style>
