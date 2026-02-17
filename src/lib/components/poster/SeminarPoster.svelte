<script lang="ts">
  interface Props {
    title?: string;
    abstract?: string;
    date?: string;
    place?: string;
    prerequisite?: string;
    speaker?: string;
    clubName?: string;
    handle?: string;
    logoSrc?: string;
  }

  let {
    title = "수체와 타원곡선을 잇는 L-함수",
    abstract = "세미나 소개를 입력하면 포스터 문구가 자동으로 반영됩니다.",
    date = "추후 공지",
    place = "추후 공지",
    prerequisite = "선수 지식 미정",
    speaker = "발표: 미정",
    clubName = "서울대학교 수학문제연구회",
    handle = "@SNU_MPS",
    logoSrc = "/posters/favicon.svg",
  }: Props = $props();

  function charUnits(value: string): number {
    let units = 0;
    for (const char of Array.from(value)) {
      const code = char.codePointAt(0) ?? 0;
      if (/\s/.test(char)) {
        units += 0.35;
        continue;
      }
      if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff)) {
        units += 1;
        continue;
      }
      if (code >= 0x4e00 && code <= 0x9fff) {
        units += 1;
        continue;
      }
      if (/[0-9]/.test(char)) {
        units += 0.58;
        continue;
      }
      if (/[A-Z]/.test(char)) {
        units += 0.68;
        continue;
      }
      if (/[a-z]/.test(char)) {
        units += 0.6;
        continue;
      }
      units += 0.52;
    }
    return units;
  }

  function chunkLongWordByUnits(value: string, maxUnits: number): string[] {
    const chars = Array.from(value);
    const chunks: string[] = [];
    let current = "";
    for (const char of chars) {
      const candidate = `${current}${char}`;
      if (current && charUnits(candidate) > maxUnits) {
        chunks.push(current);
        current = char;
        continue;
      }
      current = candidate;
    }
    if (current) chunks.push(current);
    return chunks;
  }

  function wrapTextByUnits(text: string, maxUnits: number, maxLines: number): string[] {
    const lines: string[] = [];
    if (!text.trim()) return lines;
    const words = text.split(/\s+/).filter(Boolean);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (charUnits(candidate) <= maxUnits) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        if (lines.length >= maxLines) break;
        current = "";
      }
      if (charUnits(word) <= maxUnits) {
        current = word;
        continue;
      }
      const chunked = chunkLongWordByUnits(word, maxUnits);
      for (const piece of chunked) {
        lines.push(piece);
        if (lines.length >= maxLines) break;
      }
      if (lines.length >= maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);
    return lines.slice(0, maxLines);
  }

  let titleLines = $derived(wrapTextByUnits(title, 11.2, 2));
  let accentTitleIndex = $derived(titleLines.length > 1 ? titleLines.length - 1 : -1);
</script>

<main class="stage" data-poster-root="seminar">
  <article class="poster">
    <div class="paper-symbols" aria-hidden="true">
      <span class="paper-symbol">∑</span>
      <span class="paper-symbol">∫</span>
      <span class="paper-symbol">∏</span>
      <span class="paper-symbol">∂</span>
      <span class="paper-symbol">∞</span>
      <span class="paper-symbol">λ</span>
    </div>

    <div class="logo-overlay" aria-hidden="true">
      <img src={logoSrc} alt="" />
    </div>

    <div class="logo-overlay-secondary" aria-hidden="true">
      <img src={logoSrc} alt="" />
    </div>

    <div class="rule-thick"></div>

    <section class="hero">
      <h1 class="title">
        {#each titleLines as line, index}
          <span class="title-line" class:accent={index === accentTitleIndex}>{line}</span>
        {/each}
      </h1>

      <section class="abstract-panel">
        <p class="abstract-body">{abstract}</p>
      </section>
    </section>

    <section class="main">
      <aside class="left-info">
        <p class="info-item"><span class="info-key">일시</span>{date}</p>
        <p class="info-item"><span class="info-key">장소</span>{place}</p>
        <p class="info-item"><span class="info-key">선수지식</span>{prerequisite}</p>
        <p class="speaker">{speaker}</p>
      </aside>
    </section>

    <footer class="foot">
      <div class="foot-meta">
        <p class="club">{clubName}</p>
        <p class="handle">{handle}</p>
      </div>
    </footer>
  </article>
</main>

<style>
  * {
    box-sizing: border-box;
  }

  .stage {
    width: 1080px;
    height: 1350px;
  }

  .poster {
    --latex-bg: #f4f4f4;
    --latex-text: #111111;
    --latex-muted: #4a4a4a;
    --latex-rule: #1a1a1a;
    --latex-accent: #b22222;

    position: relative;
    width: 100%;
    height: 100%;
    background: var(--latex-bg);
    border: 1px solid var(--latex-rule);
    padding: 1.65375rem;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 0.97875rem;
    overflow: hidden;
    color: var(--latex-text);
    font-family:
      "Noto Sans KR",
      "Apple SD Gothic Neo",
      "Malgun Gothic",
      sans-serif;
    font-synthesis: weight style;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
  }

  .poster::before {
    content: "";
    position: absolute;
    inset: 12px;
    border: 1px solid rgba(26, 26, 26, 0.56);
    pointer-events: none;
  }

  .logo-overlay {
    position: absolute;
    right: 20px;
    top: 72%;
    width: 276px;
    pointer-events: none;
    z-index: 0;
    opacity: 0.11;
    transform: rotate(-12deg);
  }

  .logo-overlay img {
    width: 100%;
    height: auto;
    object-fit: contain;
    filter: grayscale(8%) contrast(114%) brightness(84%);
  }

  .logo-overlay-secondary {
    position: absolute;
    left: 18px;
    top: 84%;
    width: 200px;
    pointer-events: none;
    z-index: 0;
    opacity: 0.08;
    transform: rotate(16deg);
  }

  .logo-overlay-secondary img {
    width: 100%;
    height: auto;
    object-fit: contain;
    filter: grayscale(14%) contrast(108%) brightness(88%);
  }

  .paper-symbols {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    color: #666;
    font-family: "STIX Two Text", "Times New Roman", serif;
    font-style: italic;
  }

  .paper-symbol {
    position: absolute;
    opacity: 0.11;
    line-height: 1;
    transform-origin: center;
  }

  .paper-symbol:nth-child(1) {
    right: 13%;
    top: 18%;
    font-size: 6.8rem;
    transform: rotate(-12deg);
  }

  .paper-symbol:nth-child(2) {
    left: 11%;
    top: 22%;
    font-size: 5.8rem;
    transform: rotate(9deg);
    opacity: 0.085;
  }

  .paper-symbol:nth-child(3) {
    right: 16%;
    top: 47%;
    font-size: 7.4rem;
    transform: rotate(-9deg);
    opacity: 0.12;
  }

  .paper-symbol:nth-child(4) {
    left: 14%;
    top: 56%;
    font-size: 6.2rem;
    transform: rotate(11deg);
    opacity: 0.094;
  }

  .paper-symbol:nth-child(5) {
    right: 19%;
    bottom: 19%;
    font-size: 6.6rem;
    transform: rotate(-8deg);
  }

  .paper-symbol:nth-child(6) {
    left: 30%;
    bottom: 10%;
    font-size: 5.8rem;
    transform: rotate(10deg);
    opacity: 0.09;
  }

  .rule-thick {
    position: relative;
    z-index: 1;
    height: 0;
    border-top: 2px solid var(--latex-rule);
  }

  .hero {
    position: relative;
    z-index: 1;
    display: grid;
    align-content: center;
    justify-items: center;
    text-align: center;
    gap: 1.8rem;
    padding-inline: 1.9rem;
    padding-top: 7.72rem;
    padding-bottom: 1.44rem;
  }

  .title {
    margin: 0;
    font-family:
      "Noto Sans KR",
      "Apple SD Gothic Neo",
      "Malgun Gothic",
      sans-serif;
    font-size: 5.96rem;
    line-height: 1;
    letter-spacing: -0.012em;
    font-weight: 900;
    font-synthesis: weight style;
    font-synthesis-weight: auto;
    text-rendering: geometricPrecision;
    -webkit-text-stroke: 0.34px currentColor;
    text-shadow:
      0.012em 0 0 currentColor,
      -0.012em 0 0 currentColor;
    word-break: keep-all;
    hyphens: none;
    padding-inline: 0.35rem;
    padding-top: 0.26rem;
    padding-bottom: 0.44rem;
  }

  .title-line {
    display: block;
    white-space: nowrap;
    font-weight: 900;
    font-synthesis: weight style;
    font-synthesis-weight: auto;
  }

  .title-line + .title-line {
    margin-top: 0.08em;
  }

  .accent {
    color: var(--latex-accent);
  }

  .abstract-panel {
    width: 840px;
    border-top: 1px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    padding: 1.78rem 0;
    display: grid;
    gap: 0.24rem;
    justify-items: center;
    margin-top: 3.2rem;
  }

  .abstract-body {
    margin: 0;
    width: 780px;
    font-family:
      "Noto Sans KR",
      "Apple SD Gothic Neo",
      "Malgun Gothic",
      sans-serif;
    font-size: 2.62rem;
    font-weight: 800;
    font-variation-settings: "wght" 800;
    line-height: 1.36;
  }

  .main {
    position: relative;
    z-index: 1;
    width: 100%;
    margin: 0;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    height: 100%;
    padding-top: 1.12rem;
  }

  .left-info {
    border-top: 1px solid rgba(26, 26, 26, 0.62);
    border-bottom: 1px solid rgba(26, 26, 26, 0.62);
    padding: 2.2rem 1.08rem;
    display: grid;
    height: auto;
    grid-template-rows: auto auto auto auto;
    align-content: start;
    gap: 1.28rem;
    width: 940px;
    max-width: 100%;
    margin-top: auto;
  }

  .info-item {
    margin: 0;
    font-family:
      "Noto Sans KR",
      "Apple SD Gothic Neo",
      "Malgun Gothic",
      sans-serif;
    font-size: 2.22rem;
    font-weight: 800;
    font-variation-settings: "wght" 800;
    line-height: 1.24;
  }

  .info-key {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.72em;
    letter-spacing: 0.06em;
    color: var(--latex-muted);
    margin-right: 0.38rem;
  }

  .speaker {
    margin: 0;
    font-family:
      "Noto Sans KR",
      "Apple SD Gothic Neo",
      "Malgun Gothic",
      sans-serif;
    font-size: 1.96rem;
    font-weight: 700;
    font-variation-settings: "wght" 700;
    color: var(--latex-muted);
    line-height: 1.22;
    align-self: start;
    margin-top: 0.22rem;
  }

  .foot {
    position: relative;
    z-index: 1;
    border-top: 1px solid var(--latex-rule);
    padding-top: 0.82rem;
    display: grid;
    gap: 0.34rem;
  }

  .foot-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.7rem;
  }

  .club {
    margin: 0;
    font-family:
      "Noto Sans KR",
      "Apple SD Gothic Neo",
      "Malgun Gothic",
      sans-serif;
    font-size: 2.26rem;
    font-weight: 800;
    font-variation-settings: "wght" 800;
  }

  .handle {
    margin: 0;
    font-family: "JetBrains Mono", monospace;
    font-size: 1.88rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--latex-muted);
    font-weight: 700;
  }
</style>
