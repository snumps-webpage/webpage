<script lang="ts">
  import { page } from "$app/state";

  let {
    title = "원본 자료 연결 대기",
    detail,
  }: { title?: string; detail: string } = $props();

  // detail은 명세·이관 상태 같은 내부 운영 정보다 — 일반 방문자·회원에게는
  // 준비 중이라는 사실만 알리고, 상세 사유는 관리자에게만 보인다.
  const isAdmin = $derived(page.data.isAdmin === true);
</script>

<section class="pending-notice" aria-labelledby="pending-source-title">
  <span aria-hidden="true">§</span>
  <div>
    <h2 id="pending-source-title">{title}</h2>
    {#if isAdmin}
      <p>{detail}</p>
      <p class="policy">자료가 없는 상태에서 내용·날짜·링크를 추정해 표시하지 않습니다.</p>
      <p class="policy admin-only">위 상세 사유는 관리자에게만 표시됩니다.</p>
    {:else}
      <p>자료를 준비하고 있습니다. 정리가 끝나는 대로 이 페이지에 게시됩니다.</p>
    {/if}
  </div>
</section>

<style>
  .pending-notice { display: grid; grid-template-columns: auto 1fr; gap: 0.8rem; padding: 1rem; border: 1px dashed var(--latex-rule); }
  .pending-notice > span { color: var(--latex-accent); font-family: var(--font-math); font-size: 1.8rem; line-height: 1; }
  h2, p { margin: 0; }
  h2 { font-size: 1rem; font-weight: 570; }
  p { margin-top: 0.32rem; color: var(--latex-muted); font-size: 0.82rem; line-height: 1.6; }
  .policy { font-family: var(--font-mono); font-size: 0.62rem; }
  .admin-only { color: var(--latex-accent); }
</style>
