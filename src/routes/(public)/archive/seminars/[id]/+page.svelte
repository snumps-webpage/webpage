<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { formatArchiveTerm } from "$lib/domain/public-content";
  import { ARCHIVE_NAV } from "$lib/public-navigation";

  let { data } = $props();
  const seminar = $derived(data.seminar);
  const presenterNames = $derived([
    ...seminar.presenters,
    ...(seminar.externalPresenters ? [seminar.externalPresenters] : []),
  ]);
  const files = $derived(
    seminar.materials.map((url) => {
      const name = decodeURIComponent(url.split("/").pop() ?? url);
      const extension = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
      const kind =
        extension === "pdf" ? "pdf"
        : ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(extension) ? "image"
        : "link";
      return { id: url, name, url, kind };
    }),
  );

  function dateTimeLabel(value: string | null) {
    if (!value) return "일정 기록 없음";
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }).format(new Date(value));
  }
</script>

<svelte:head>
  <title>{seminar?.title ?? "세미나 기록"} · SNUMPS</title>
</svelte:head>

<article class="paper-document detail-paper">
  <ManuscriptHeader title={seminar?.title ?? "세미나 기록"} subtitle="Seminar Record" figure={MANUSCRIPT.FIGURES.ARCHIVE_SEMINARS} />
  <PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" />

  {#if seminar}
    <dl class="metadata-grid">
      <div><dt>학기</dt><dd>{formatArchiveTerm(seminar.semester)}</dd></div>
      <div><dt>발표자</dt><dd>{presenterNames.join(", ")}</dd></div>
      <div><dt>일시</dt><dd>{dateTimeLabel(seminar.scheduledAt)}</dd></div>
      <div><dt>소요 시간</dt><dd>{seminar.duration || "기록 없음"}</dd></div>
      <div><dt>선수지식</dt><dd>{seminar.prerequisites || "기록 없음"}</dd></div>
    </dl>

    <section class="record-section">
      <h2>1. 개요</h2>
      <p>{seminar.description}</p>
    </section>
    <section class="record-section">
      <h2>2. 공개 자료</h2>
      {#if files.length}
        <ul class="file-list">
          {#each files as file (file.id)}
            <li><a href={file.url} target="_blank" rel="noopener noreferrer">{file.name}</a><span>{file.kind}</span></li>
          {/each}
        </ul>
      {:else}
        <p class="empty">등록된 공개 자료가 없습니다.</p>
      {/if}
    </section>
    <a class="paper-btn" href="/archive/seminars">← 세미나 목록</a>
  {:else}
    <p class="empty">새 AWS 공개 세미나 API 연결 후 기록이 표시됩니다.</p>
  {/if}
</article>

<style>
  .detail-paper { width: min(100%, 880px); }
  .metadata-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 0 1.4rem; border-top: 2px solid var(--latex-rule); border-bottom: 2px solid var(--latex-rule); }
  .metadata-grid > div { display: grid; grid-template-columns: 6rem 1fr; padding: 0.62rem 0.7rem; border-bottom: 1px solid var(--latex-rule); }
  .metadata-grid > div:nth-last-child(-n + 2) { border-bottom: 0; }
  dt { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.6rem; font-weight: 700; text-transform: uppercase; }
  dd { margin: 0; font-size: 0.8rem; }
  .record-section { margin: 1.2rem 0; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }
  .record-section h2 { margin: 0 0 0.55rem; font-size: 1.05rem; font-weight: 570; }
  .record-section p { margin: 0; color: var(--latex-muted); font-size: 0.86rem; line-height: 1.75; }
  .file-list { margin: 0; padding: 0; list-style: none; border: 1px solid var(--latex-rule); }
  .file-list li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--latex-rule); }
  .file-list li:last-child { border-bottom: 0; }
  .file-list a { color: var(--latex-text); }
  .file-list span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; text-transform: uppercase; }
  @media (max-width: 680px) {
    .metadata-grid { grid-template-columns: 1fr; }
    .metadata-grid > div, .metadata-grid > div:nth-last-child(-n + 2) { border-bottom: 1px solid var(--latex-rule); }
    .metadata-grid > div:last-child { border-bottom: 0; }
  }
</style>
