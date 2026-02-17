<script lang="ts">
  import SeminarPoster from "$lib/components/poster/SeminarPoster.svelte";
  type PosterMode = "light" | "dark";

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
  let posterMode = $state<PosterMode>("light");

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
        backgroundColor: posterMode === "dark" ? "#121212" : "#f4f4f4",
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
    <div class="poster-header-main">
      <h3 class="poster-title no-sel">포스터 미리보기</h3>
      <p class="poster-note no-sel">입력한 정보가 즉시 반영됩니다.</p>
    </div>
    <div class="poster-mode" role="group" aria-label="포스터 모드 선택">
      <button
        type="button"
        class="mode-btn"
        class:active={posterMode === "light"}
        onclick={() => (posterMode = "light")}
      >
        라이트
      </button>
      <button
        type="button"
        class="mode-btn"
        class:active={posterMode === "dark"}
        onclick={() => (posterMode = "dark")}
      >
        다크
      </button>
    </div>
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
            mode={posterMode}
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
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.72rem;
    margin-bottom: 0.78rem;
  }

  .poster-header-main {
    display: grid;
    gap: 0.24rem;
  }

  .poster-title {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .poster-note {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.82rem;
    line-height: 1.36;
  }

  .poster-mode {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
  }

  .mode-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--latex-rule) 70%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.28rem 0.5rem;
    min-height: 1.65rem;
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s, color 0.2s;
  }

  .mode-btn:hover {
    border-color: var(--latex-rule);
    color: var(--latex-text);
  }

  .mode-btn.active {
    border-color: var(--latex-rule);
    background: var(--latex-text);
    color: var(--latex-bg);
  }

  .mode-btn:focus-visible {
    outline: 2px solid var(--latex-accent);
    outline-offset: 2px;
  }

  .poster-frame {
    border: 1px solid var(--latex-rule);
    padding: 0.58rem;
    width: fit-content;
    max-width: 100%;
    background: color-mix(in srgb, var(--latex-bg) 92%, #fff 8%);
    overflow-x: auto;
    overflow-y: hidden;
    display: block;
  }

  .poster-scale-wrap {
    width: calc(1080px * 0.39);
    height: calc(1350px * 0.39);
    margin: 0 auto;
    flex: 0 0 auto;
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

  :global(.dark) .poster-frame {
    background: color-mix(in srgb, var(--latex-bg) 97%, #000 3%);
    border-color: color-mix(in srgb, var(--latex-rule) 72%, transparent);
  }

  :global(.dark) .poster-scale-wrap {
    filter: drop-shadow(0 0.45rem 1rem rgba(0, 0, 0, 0.44));
  }

  @media (max-width: 640px) {
    .poster-header {
      align-items: stretch;
    }

    .poster-mode {
      width: 100%;
    }

    .mode-btn {
      flex: 1 1 0;
      justify-content: center;
    }

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
