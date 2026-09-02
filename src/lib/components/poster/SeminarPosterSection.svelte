<script lang="ts">
    import SeminarPosterDownloadPanel from './SeminarPosterDownloadPanel.svelte';
    import PosterUploadField from './PosterUploadField.svelte';
    import type { MemberPickerItem } from '$lib/domain/seminars';

    let {
        seminarTitle = '',
        seminarDescription = '',
        seminarPrerequisites = '',
        selectedSpeakers = [] as MemberPickerItem[]
    } = $props();

    // 포스터 방식: 자동 생성 미리보기 vs 직접 업로드(PNG/JPEG)
    let posterMode = $state<'auto' | 'upload'>('auto');

    let posterDateInput = $state('');
    let posterPlaceInput = $state('');
    let posterHelperOpen = $state(false);

    let posterTitle = $derived(seminarTitle.trim() || '세미나 제목을 입력해 주세요');
    let posterAbstract = $derived(
        seminarDescription.trim() || '세미나 설명을 입력하면 포스터 소개 문구가 자동 반영됩니다.'
    );
    let posterPrerequisite = $derived(seminarPrerequisites.trim() || '없음');
    let posterDate = $derived(posterDateInput.trim() || '추후 공지');
    let posterPlace = $derived(posterPlaceInput.trim() || '추후 공지');
    let posterSpeaker = $derived(
        selectedSpeakers.length > 0
            ? `발표: ${selectedSpeakers[0].name}${selectedSpeakers.length > 1 ? ` 외 ${selectedSpeakers.length - 1}명` : ''}`
            : '발표: 미정'
    );
</script>

<div class="poster-logic-container">
    <div class="mode-toggle" role="radiogroup" aria-label="포스터 방식">
        <button type="button" class="paper-btn small" class:active={posterMode === 'auto'} aria-pressed={posterMode === 'auto'} onclick={() => (posterMode = 'auto')}>자동 생성</button>
        <button type="button" class="paper-btn small" class:active={posterMode === 'upload'} aria-pressed={posterMode === 'upload'} onclick={() => (posterMode = 'upload')}>직접 업로드 (PNG/JPEG)</button>
    </div>

    {#if posterMode === 'upload'}
        <div class="poster-upload-wrap">
            <PosterUploadField />
            <p class="paper-hint">직접 올린 포스터는 승인 후 세미나에 사용됩니다. 자동 생성 포스터 대신 쓰입니다.</p>
        </div>
    {:else}
    <div class="label-row">
        <span class="paper-label">포스터 미리보기 도움말 (Poster Helper)</span>
        <button type="button" class="paper-btn small" onclick={() => posterHelperOpen = !posterHelperOpen}>
            {posterHelperOpen ? '도움말 닫기' : '도움말 열기'}
        </button>
    </div>

    {#if posterHelperOpen}
        <div class="poster-inputs">
            <div class="paper-field">
                <label for="p-date" class="paper-label">포스터용 날짜 (예: 3월 15일 18:00)</label>
                <input type="text" id="p-date" bind:value={posterDateInput} placeholder="추후 공지" />
            </div>
            <div class="paper-field">
                <label for="p-place" class="paper-label">포스터용 장소 (예: 27동 204호)</label>
                <input type="text" id="p-place" bind:value={posterPlaceInput} placeholder="추후 공지" />
            </div>
            <p class="paper-hint">이 정보는 포스터 생성에만 사용되며 신청서에는 포함되지 않습니다.</p>
        </div>
    {/if}

    <SeminarPosterDownloadPanel
        title={posterTitle}
        speaker={posterSpeaker}
        abstract={posterAbstract}
        date={posterDate}
        place={posterPlace}
        prerequisite={posterPrerequisite}
    />
    {/if}
</div>

<style>
    .mode-toggle { display: flex; gap: 0.4rem; }
    .mode-toggle .active { background: var(--latex-text); color: var(--latex-bg); }
    .poster-upload-wrap { display: grid; gap: 0.5rem; padding: 1rem; border: 1px solid var(--latex-rule); }
    .poster-logic-container {
        display: grid;
        gap: 0.85rem;
    }

    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .poster-inputs {
        padding: 1rem;
        border: 1px solid var(--latex-rule);
        background: color-mix(in srgb, var(--latex-bg) 96%, var(--latex-text));
        display: grid;
        gap: 0.75rem;
    }
</style>
