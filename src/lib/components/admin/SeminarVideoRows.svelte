<script lang="ts">
  import { untrack } from "svelte";
  import { SEMINAR_VIDEO_LIMITS } from "$lib/domain/seminar-videos";

  /**
   * 세미나 기록 편집기의 영상 링크 행 — `videoUrl`·`videoTitle`을 같은 순서로
   * 보내고, `videosSent` 표식으로 "이 폼은 영상 칸을 보냈다"를 알린다(빈 목록도
   * 의미가 있다: 전부 지운 것). 규칙은 domain/seminar-videos.ts.
   */
  let {
    videos = [],
    issue = "",
  }: { videos?: { url: string; title: string }[]; issue?: string } = $props();

  let rows = $state(
    untrack(() => videos.map((v) => ({ url: v.url, title: v.title }))),
  );
  const full = $derived(rows.length >= SEMINAR_VIDEO_LIMITS.count);
</script>

<fieldset class="video-rows">
  <legend>영상 링크</legend>
  <input type="hidden" name="videosSent" value="1" />
  {#each rows as row, i (i)}
    <div class="video-row">
      <input
        name="videoUrl"
        type="url"
        placeholder="https://www.youtube.com/watch?v=…"
        maxlength={SEMINAR_VIDEO_LIMITS.url}
        aria-label={`영상 ${i + 1} 링크`}
        bind:value={row.url}
      />
      <input
        name="videoTitle"
        placeholder="제목 (선택)"
        maxlength={SEMINAR_VIDEO_LIMITS.title}
        aria-label={`영상 ${i + 1} 제목`}
        bind:value={row.title}
      />
      <button
        type="button"
        class="paper-btn small"
        aria-label={`영상 ${i + 1} 삭제`}
        onclick={() => rows.splice(i, 1)}>삭제</button
      >
    </div>
  {:else}
    <p class="empty">등록된 영상이 없습니다.</p>
  {/each}
  <button
    type="button"
    class="paper-btn small"
    disabled={full}
    onclick={() => rows.push({ url: "", title: "" })}
    >{full ? `최대 ${SEMINAR_VIDEO_LIMITS.count}개` : "+ 영상 추가"}</button
  >
  {#if issue}<small class="field-error" role="alert">{issue}</small>{/if}
</fieldset>

<style>
  .video-rows {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
  }
  legend {
    padding: 0 0.3rem;
    font: 700 0.6rem/1 var(--font-mono);
    letter-spacing: 0.06em;
  }
  .video-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
    gap: 0.4rem;
  }
  .video-row input {
    min-width: 0;
  }
  .empty {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.74rem;
  }
  .video-rows > .paper-btn {
    justify-self: start;
  }
  .field-error {
    color: var(--color-danger-text);
    font-size: 0.72rem;
  }
  @media (max-width: 560px) {
    .video-row {
      grid-template-columns: 1fr;
    }
  }
</style>
