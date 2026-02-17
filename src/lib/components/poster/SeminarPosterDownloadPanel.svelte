<script lang="ts">
  import SeminarPoster from "$lib/components/poster/SeminarPoster.svelte";

  interface Props {
    title: string;
    abstract: string;
    date: string;
    place: string;
    prerequisite: string;
    speaker: string;
    clubName?: string;
    handle?: string;
  }

  let {
    title,
    abstract,
    date,
    place,
    prerequisite,
    speaker,
    clubName = "서울대학교 수학문제연구회",
    handle = "@SNU_MPS",
  }: Props = $props();

  let posterNode = $state<HTMLElement | null>(null);
  let downloading = $state(false);
  let downloadError = $state("");

  function slugify(value: string): string {
    const normalized = value.trim().replace(/\s+/g, "-");
    return normalized
      .replace(/[^0-9A-Za-z가-힣-]/g, "")
      .slice(0, 80) || "snumps-seminar-poster";
  }

  async function downloadPoster() {
    if (!posterNode || downloading) return;
    downloading = true;
    downloadError = "";

    try {
      const posterRoot = posterNode.querySelector<HTMLElement>('[data-poster-root="seminar"]');
      if (!posterRoot) throw new Error("Poster root not found");

      if (typeof document !== "undefined" && "fonts" in document) {
        await document.fonts.ready;
      }

      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(posterRoot, {
        cacheBust: true,
        backgroundColor: "#f4f4f4",
        pixelRatio: 2,
        // Avoid parsing app-level remote @font-face trees (CMU css imports),
        // which can resolve to route-relative 404 URLs in dev and break capture.
        skipFonts: true,
        fontEmbedCSS: "",
        width: 1080,
        height: 1350,
        canvasWidth: 1080,
        canvasHeight: 1350,
      });

      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${slugify(title)}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      console.error("[SeminarPosterDownload] Failed:", error);
      downloadError =
        "포스터 다운로드에 실패했습니다. 잠시 후 다시 시도하거나 브라우저를 새로고침해 주세요.";
    } finally {
      downloading = false;
    }
  }
</script>

<section class="poster-panel">
  <header class="poster-header">
    <h3 class="poster-title no-sel">포스터 미리보기</h3>
    <p class="poster-note no-sel">입력한 정보가 즉시 반영됩니다.</p>
  </header>

  <div class="poster-frame">
    <div class="poster-scale-wrap">
      <div class="poster-scale">
        <div class="poster-capture" bind:this={posterNode}>
          <SeminarPoster
            {title}
            {abstract}
            {date}
            {place}
            {prerequisite}
            {speaker}
            {clubName}
            {handle}
          />
        </div>
      </div>
    </div>
  </div>

  <div class="poster-actions">
    <button type="button" class="paper-btn primary" onclick={downloadPoster} disabled={downloading}>
      {downloading ? "PNG 생성 중..." : "포스터 PNG 다운로드"}
    </button>
  </div>

  {#if downloadError}
    <p class="paper-status-note error">{downloadError}</p>
  {/if}
</section>

<style>
  .poster-panel {
    margin-top: 0.15rem;
  }

  .poster-header {
    margin-bottom: 0.78rem;
  }

  .poster-title {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .poster-note {
    margin: 0.35rem 0 0;
    color: var(--latex-muted);
    font-size: 0.82rem;
    line-height: 1.36;
  }

  .poster-frame {
    border: 1px solid var(--latex-rule);
    padding: 0.58rem;
    background: #efefef;
    overflow: auto;
  }

  .poster-scale-wrap {
    width: calc(1080px * 0.39);
    height: calc(1350px * 0.39);
  }

  .poster-scale {
    transform: scale(0.39);
    transform-origin: top left;
    width: 1080px;
    height: 1350px;
  }

  .poster-capture {
    width: 1080px;
    height: 1350px;
  }

  .poster-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
  }

  .poster-actions :global(.paper-btn) {
    min-width: 12.5rem;
    justify-content: center;
  }

  @media (max-width: 640px) {
    .poster-scale-wrap {
      width: calc(1080px * 0.27);
      height: calc(1350px * 0.27);
    }

    .poster-scale {
      transform: scale(0.27);
    }

    .poster-actions {
      justify-content: stretch;
    }

    .poster-actions :global(.paper-btn) {
      width: 100%;
    }
  }
</style>
