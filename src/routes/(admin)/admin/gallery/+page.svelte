<script lang="ts">
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import AdminDirectUploadForm from "$lib/components/admin/AdminDirectUploadForm.svelte";

  let { data, form } = $props();
  let query = $state("");
  const records = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return data.gallery.filter((record) =>
      !normalized || [record.title, record.year, record.date].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized)),
    );
  });
  const messages: Record<string, string> = {
    galleryCreated: "갤러리 기록을 생성했습니다.",
    galleryUpdated: "갤러리 메타데이터를 수정했습니다.",
    galleryPhotoAdded: "사진 원본 메타데이터를 등록했습니다.",
    galleryPhotoRemoved: "사진 연결을 제거했습니다.",
    galleryDeleted: "갤러리 기록을 삭제했습니다.",
  };
</script>

<svelte:head><title>갤러리 관리 · SNUMPS 관리자</title></svelte:head>

<article class="paper-document gallery-admin-paper">
  <ManuscriptHeader title="갤러리 관리" subtitle="Gallery Record Editor" figure={MANUSCRIPT.FIGURES.ADMIN_GALLERY} />
  <AdminSectionNav />
  <p class="scope-note">운영에서는 원본을 presigned PUT으로 스토리지에 직접 업로드하고, 등록 후 400px 썸네일과 1200px 표시본을 생성합니다. 현재 로컬 프리뷰는 파일 검증과 메타데이터 등록까지 재현합니다.</p>
  {#if form?.success && form.operation}<p class="paper-status-note success" role="status">{messages[form.operation as string]}</p>{/if}
  {#if form?.error}<p class="paper-status-note error" role="alert">{form.message ?? "갤러리 기록을 처리하지 못했습니다."}</p>{/if}

  <section class="create-panel">
    <h2>1. 새 갤러리 기록</h2>
    <form method="POST" action="?/create" class="record-form create-form">
      <label><span class="paper-label">연도</span><input name="year" placeholder="2026" /></label>
      <label class="alt-field"><span class="paper-label">연결 활동 (회식)</span><select name="activityId"><option value="">연결 안 함</option>{#each data.activities as activity (activity.id)}<option value={activity.id}>{activity.date} · {activity.title}</option>{/each}</select></label>
      <button class="paper-btn primary" type="submit">기록 생성</button>
    </form>
  </section>

  <section class="record-index">
    <div class="section-title"><div><span>2.</span><h2>갤러리 레코드</h2></div><label><span class="paper-label">검색</span><input type="search" bind:value={query} placeholder="제목, 연도 또는 날짜" /></label></div>
    <div class="gallery-records">
      {#each records as record (record.id)}
        <article class="gallery-card">
          <header><div><span>{record.date} · 회식</span><h3>{record.title}</h3></div><strong class:attached={record.photos.length > 0}>{record.photos.length ? `원본 ${record.photos.length}장` : "원본 없음"}</strong></header>
          <form method="POST" action="?/update" class="record-form"><input type="hidden" name="id" value={record.id} /><label><span class="paper-label">연도</span><input name="year" value={record.year} /></label><label class="alt-field"><span class="paper-label">연결 활동 (회식)</span><select name="activityId"><option value="">연결 안 함</option>{#each data.activities as activity (activity.id)}<option value={activity.id} selected={record.activityId === activity.id}>{activity.date} · {activity.title}</option>{/each}</select></label><button class="paper-btn" type="submit">정보 수정</button></form>
          <div class="asset-row">
            {#each record.photos as photo (photo.s3Key)}
              <div class="photo-line">
                <div class="file-meta"><strong>{photo.name}</strong><small>프리뷰에서는 CDN 파생본을 생성하지 않습니다.</small></div>
                <form method="POST" action="?/removePhoto" onsubmit={(event) => { if (!confirm("사진 연결을 제거할까요?")) event.preventDefault(); }}><input type="hidden" name="id" value={record.id} /><input type="hidden" name="s3Key" value={photo.s3Key} /><button class="paper-btn small" type="submit">사진 제거</button></form>
              </div>
            {/each}
            <AdminDirectUploadForm recordId={record.id} action="?/addPhoto" inputName="photo" accept="image/jpeg,image/png,image/webp" label="사진 원본 · JPEG/PNG/WebP · 최대 10MB" imagePurpose="gallery-photo" buttonLabel="사진 등록" />
          </div>
          <form method="POST" action="?/delete" class="delete-row" onsubmit={(event) => { if (!confirm(`'${record.title}' 갤러리 기록을 삭제할까요?`)) event.preventDefault(); }}><input type="hidden" name="id" value={record.id} /><span>기록을 삭제하면 공개 갤러리에서도 즉시 사라집니다.</span><button class="paper-btn small" type="submit">기록 삭제</button></form>
        </article>
      {:else}<p class="empty">검색 조건에 맞는 갤러리 기록이 없습니다.</p>{/each}
    </div>
  </section>
  <p class="freshness">프리뷰 데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}</p>
</article>

<style>
  .gallery-admin-paper { width: min(100%, 1140px); }.scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; }
  .create-panel, .record-index { margin-top: 1.2rem; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }h2, h3 { margin: 0; font-weight: 570; }h2 { font-size: 1.08rem; }h3 { font-size: 0.98rem; }
  .record-form { display: grid; grid-template-columns: 9rem minmax(0, 1.2fr) auto; gap: 0.6rem; align-items: end; margin-top: 0.7rem; }.record-form input, .record-form select, .section-title input { width: 100%; min-height: 2.7rem; padding: 0.55rem 0.65rem; }
  .section-title { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 0.7rem; }.section-title > div { display: flex; align-items: baseline; gap: 0.5rem; }.section-title > div > span { color: var(--latex-accent); font-family: var(--font-mono); font-size: 0.7rem; font-weight: 700; }.section-title label { width: min(100%, 24rem); }
  .gallery-records { display: grid; gap: 0.7rem; }.gallery-card { padding: 0.8rem; border: 1px solid var(--latex-rule); }.gallery-card > header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }.gallery-card header span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.57rem; }.gallery-card header > strong { padding: 0.18rem 0.35rem; border: 1px dashed var(--latex-rule); color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.54rem; }.gallery-card header > strong.attached { border-style: solid; color: var(--latex-text); }
  .asset-row { display: grid; gap: 0.7rem; margin-top: 0.8rem; padding: 0.7rem; border: 1px solid var(--latex-rule); }.photo-line { display: flex; align-items: end; justify-content: space-between; gap: 0.7rem; padding-bottom: 0.6rem; border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 58%, transparent); }.file-meta { display: grid; }.file-meta strong { font-size: 0.8rem; }.file-meta small, .delete-row span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.57rem; }
  .delete-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.8rem; padding-top: 0.7rem; border-top: 1px solid var(--latex-rule); }.freshness { margin: 1rem 0 0; color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; text-align: right; text-transform: uppercase; }
  @media (max-width: 920px) { .record-form { grid-template-columns: 1fr 1fr; }.record-form .alt-field { grid-column: 1 / -1; } }
  @media (max-width: 580px) { .record-form { grid-template-columns: 1fr; }.record-form .alt-field { grid-column: auto; }.section-title, .gallery-card > header, .photo-line, .delete-row { align-items: stretch; flex-direction: column; }.section-title label { width: 100%; }.asset-row button, .delete-row button { width: 100%; } }
</style>
