<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import SourcePendingNotice from "$lib/components/public/SourcePendingNotice.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ABOUT_NAV } from "$lib/public-navigation";
</script>
<svelte:head><title>홍보 자료 · SNUMPS</title><meta name="description" content="SNUMPS 홍보문, 포스터와 현재 가입 경로입니다." /></svelte:head>
<article class="paper-document static-paper">
  <ManuscriptHeader title="홍보 자료" subtitle="Publicity Materials" figure={MANUSCRIPT.FIGURES.PRESS} />
  <PublicDirectoryNav items={[...ABOUT_NAV]} />
  <section class="current-action"><p>Current application route</p><h2>신규 회원 가입 신청</h2><span>이전 Google Form 링크는 사용하지 않고 웹 신청서로 연결합니다.</span><a class="paper-btn primary" href="/signup">가입 신청</a></section>
  <SourcePendingNotice detail="기존 홍보문과 포스터 원본은 현재 작업 트리에 없습니다. 원본을 이관할 때 구 홍보문의 전화번호를 마스킹하고 가입 링크를 이 페이지의 /signup으로 교체합니다." />
</article>
<style>.static-paper { width: min(100%, 840px); }.current-action { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 1rem; margin-bottom: 1rem; padding: 0.85rem; border: 1px solid var(--latex-rule); }.current-action p, .current-action h2, .current-action span { margin: 0; }.current-action p { color: var(--latex-accent); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; text-transform: uppercase; }.current-action h2 { font-size: 1.05rem; font-weight: 570; }.current-action span { color: var(--latex-muted); font-size: 0.76rem; }.current-action a { grid-column: 2; grid-row: 1 / span 3; }@media (max-width: 560px) { .current-action { grid-template-columns: 1fr; }.current-action a { grid-column: 1; grid-row: auto; margin-top: 0.5rem; } }</style>
