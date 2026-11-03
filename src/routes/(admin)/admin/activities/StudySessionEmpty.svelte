<script lang="ts">
  let { totalSessions }: { totalSessions: number } = $props();
</script>

<p class="empty">
  {#if totalSessions === 0}
    아직 회차가 없습니다. 스터디 관리에서 회차를 추가할 수 있습니다.
  {:else}
    검색 조건에 맞는 회차가 없습니다.
  {/if}
</p>
