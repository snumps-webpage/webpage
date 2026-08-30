<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ARCHIVE_NAV } from "$lib/public-navigation";
  let { data } = $props();

  const categoryLabel = { seminar: "세미나", study: "스터디", dinner: "회식" } as const;
  function dateLabel(value: string) {
    // value may be a full ISO datetime, a bare date, or a bare year.
    const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00+09:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(parsed);
  }
</script>

<svelte:head><title>활동 갤러리 · SNUMPS 아카이브</title><meta name="description" content="SNUMPS 세미나, 스터디, 회식의 공개 활동 사진입니다." /></svelte:head>

<article class="paper-document gallery-paper">
  <ManuscriptHeader title="활동 갤러리" subtitle="Activity Gallery" figure={MANUSCRIPT.FIGURES.ARCHIVE_GALLERY} />
  <PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" />
  <p class="scope-note">공개 승인된 파생 이미지만 제공합니다. 목록에는 400px 썸네일, 상세 열람에는 1200px 표시본을 사용할 계약입니다.</p>
  {#if data.dataAvailable}
    <div class="gallery-grid">
      {#each data.archive.gallery as item (item.id)}
        <figure>
          {#if item.thumbnailUrl && item.displayUrl}
            <a href={item.displayUrl} target="_blank" rel="noopener noreferrer"><img src={item.thumbnailUrl} alt={item.alt} loading="lazy" /></a>
          {:else}
            <div class="image-pending" role="img" aria-label={`${item.alt} — 이미지 원본 연결 대기`}><span aria-hidden="true">▧</span><small>IMAGE SOURCE PENDING</small></div>
          {/if}
          <figcaption><span>{categoryLabel[item.category]} · {dateLabel(item.date)}</span><strong>{item.title}</strong></figcaption>
        </figure>
      {:else}<p class="empty">공개된 갤러리 자료가 없습니다.</p>{/each}
    </div>
  {:else}<p class="empty">데이터 이관 후 사진이 표시됩니다.</p>{/if}
</article>

<style>
  .gallery-paper { width: min(100%, 1040px); }
  .scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; }
  .gallery-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
  figure { min-width: 0; margin: 0; border: 1px solid var(--latex-rule); }
  figure img, .image-pending { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-bottom: 1px solid var(--latex-rule); }
  .image-pending { display: grid; place-items: center; align-content: center; gap: 0.4rem; background: repeating-linear-gradient(135deg, transparent 0 10px, color-mix(in srgb, var(--latex-rule) 5%, transparent) 10px 11px); color: var(--latex-muted); }
  .image-pending span { font-family: var(--font-math); font-size: 2.4rem; opacity: 0.45; }
  .image-pending small { font-family: var(--font-mono); font-size: 0.52rem; letter-spacing: 0.07em; }
  figcaption { display: grid; gap: 0.18rem; padding: 0.62rem 0.7rem; }
  figcaption span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.55rem; text-transform: uppercase; }
  figcaption strong { font-size: 0.82rem; font-weight: 570; line-height: 1.45; }
  @media (max-width: 720px) { .gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 460px) { .gallery-grid { grid-template-columns: 1fr; } }
</style>
