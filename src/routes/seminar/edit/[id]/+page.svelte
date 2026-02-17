<script lang="ts">
    import { untrack } from 'svelte';
    import { enhance } from '$app/forms';
    import SeminarPosterDownloadPanel from '$lib/components/poster/SeminarPosterDownloadPanel.svelte';
    import Skeleton from '$lib/components/Skeleton.svelte';
    import type { SeminarSpeaker } from '$lib/types';

    let { data, form } = $props();

    let searchQuery = $state('');
    let selectedSpeakers = $state<SeminarSpeaker[]>(untrack(() => data.request.initialSpeakers || [])); 
    let showSearch = $state(false);
    let processing = $state(false);
    let seminarTitle = $state(untrack(() => data.request.title || ''));
    let seminarDescription = $state(untrack(() => data.request.description || ''));
    let seminarPrerequisites = $state(untrack(() => data.request.prerequisites || ''));
    let posterDateInput = $state('');
    let posterPlaceInput = $state('');
    let memberDirectoryUnavailable = $derived(!!data.memberDirectoryUnavailable);

    let selectedSpeakerIds = $derived(new Set(selectedSpeakers.map(s => s.id)));
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
            : `발표: ${data.user?.name || '미정'}`
    );

    let searchResults = $derived(
        searchQuery.trim() === '' 
            ? [] 
            : data.members.filter((m: SeminarSpeaker) => 
                !selectedSpeakerIds.has(m.id) &&
                (m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                 m.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
                 m.email.toLowerCase().includes(searchQuery.toLowerCase()))
            ).slice(0, 5)
    );

    function addSpeaker(member: SeminarSpeaker) {
        selectedSpeakers = [...selectedSpeakers, member];
        searchQuery = '';
        showSearch = false;
    }

    function removeSpeaker(id: string) {
        selectedSpeakers = selectedSpeakers.filter(s => s.id !== id);
    }
</script>

<article class="paper-document seminar-paper">
    <header class="paper-document-header">
        <h1 class="paper-document-title no-sel">세미나 신청 정보 수정 원고</h1>
        <p class="paper-document-subtitle no-sel">Seminar Revision Draft</p>
    </header>
    
    {#if form?.success}
        <div class="success-message">
            <h3><span class="text-break">신청 정보가</span> <span class="text-break">수정되었습니다.</span></h3>
            <p>관리자 검토가 다시 진행됩니다.</p>
            <a href="/" class="btn home">홈으로 돌아가기</a>
        </div>
    {:else if processing}
        <div class="processing-container">
            <div class="processing-card">
                <Skeleton height="300px" borderRadius="0" />
                <div class="processing-overlay">
                    <div class="spinner"></div>
                    <p>수정 사항을 처리 중입니다...</p>
                    <span class="hint">잠시만 기다려주세요.</span>
                </div>
            </div>
        </div>
    {:else}
        <form method="POST" use:enhance={() => {
            processing = true;
            return async ({ update }) => {
                await update();
                processing = false;
            };
        }}>
            {#if form?.error}
                <p class="paper-status-note error">{form.error}</p>
            {/if}

            <ol class="paper-sections">
                <li class="paper-section">
                    <h2 class="paper-section-title">Seminar Metadata</h2>
                    <div class="field">
                        <label for="title" class="no-sel">세미나 주제 <span class="req">*</span></label>
                        <input type="text" id="title" name="title" bind:value={seminarTitle} required placeholder="예: 대수위상 세미나" />
                    </div>

                    <div class="field">
                        <label for="description" class="no-sel">세미나 설명 <span class="req">*</span></label>
                        <textarea id="description" name="description" bind:value={seminarDescription} rows="4" required placeholder="세미나의 목적과 내용을 간략히 적어주세요."></textarea>
                    </div>

                    <div class="field">
                        <label for="prerequisites" class="no-sel">선수 지식</label>
                        <textarea id="prerequisites" name="prerequisites" bind:value={seminarPrerequisites} rows="2" style="min-height: 5.5rem" placeholder="세미나를 듣기 위해 필요한 배경 지식이 있다면 적어주세요."></textarea>
                    </div>
                </li>
                <li class="paper-section">
                    <h2 class="paper-section-title">Session Logistics</h2>
                    <div class="field">
                        <label for="duration" class="no-sel">예상 소요 시간 <span class="req">*</span></label>
                        <input type="text" id="duration" name="duration" required value={data.request.duration} placeholder="예: 90분" />
                    </div>

                    <div class="field">
                        <label for="attachment" class="no-sel">첨부 파일</label>
                        <input type="url" id="attachment" name="attachment" value={data.request.attachment || ''} placeholder="Google Drive, Dropbox 링크 등 (선택 사항)" />
                        <p class="hint no-sel">강의 자료나 계획서가 있다면 링크를 입력해주세요.</p>
                    </div>

                    <div class="field">
                        <label for="poster-date" class="no-sel">포스터 일시 (다운로드용)</label>
                        <input
                            type="text"
                            id="poster-date"
                            bind:value={posterDateInput}
                            placeholder="예: 2026.03.20 (금) 18:30"
                        />
                        <p class="hint no-sel">선택 입력입니다. 비워두면 “추후 공지”로 표시됩니다.</p>
                    </div>

                    <div class="field">
                        <label for="poster-place" class="no-sel">포스터 장소 (다운로드용)</label>
                        <input
                            type="text"
                            id="poster-place"
                            bind:value={posterPlaceInput}
                            placeholder="예: 자연과학대학 25동 105호"
                        />
                        <p class="hint no-sel">선택 입력입니다. 비워두면 “추후 공지”로 표시됩니다.</p>
                    </div>
                </li>
                <li class="paper-section">
                    <h2 class="paper-section-title">Speaker Assignment</h2>
                    <div class="field">
                        <div class="label-row">
                            <span class="label-text no-sel">발표자</span>
                            <button
                                type="button"
                                class="toggle-btn"
                                onclick={() => showSearch = !showSearch}
                                disabled={memberDirectoryUnavailable}
                            >
                                {showSearch ? '닫기' : '추가'}
                            </button>
                        </div>
                        {#if memberDirectoryUnavailable}
                            <p class="hint no-sel">멤버 데이터베이스 연결에 실패해 검색 기능이 비활성화되었습니다.</p>
                        {/if}

                        <div class="speaker-selection">
                            {#if selectedSpeakers.length > 0}
                                <div class="selected-list">
                                    {#each selectedSpeakers as speaker (speaker.id)}
                                        <div class="speaker-tag">
                                            <span class="name">{speaker.name}</span>
                                            <span class="info">{speaker.department}</span>
                                            <button type="button" class="remove-tag" onclick={() => removeSpeaker(speaker.id)}>✕</button>
                                        </div>
                                    {/each}
                                </div>
                            {:else if !showSearch}
                                <p class="hint no-sel">지정하지 않을 경우 신청자 본인이 발표자가 됩니다.</p>
                            {/if}

                            {#if showSearch && !memberDirectoryUnavailable}
                                <div class="search-container">
                                    <input
                                        type="text"
                                        id="speaker-search"
                                        bind:value={searchQuery}
                                        placeholder="이름, 학과 또는 이메일로 검색..."
                                    />
                                    {#if searchResults.length > 0}
                                        <div class="results-dropdown">
                                            {#each searchResults as member (member.id)}
                                                <button type="button" class="result-item" onclick={() => addSpeaker(member)}>
                                                    <div class="main-info">
                                                        <span class="r-name">{member.name}</span>
                                                        <span class="r-dept">{member.department}</span>
                                                    </div>
                                                    <span class="r-email">{member.email}</span>
                                                </button>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                        <input type="hidden" name="speakerIds" value={JSON.stringify(selectedSpeakers.map(s => s.id))} />
                    </div>
                </li>
                <li class="paper-section">
                    <h2 class="paper-section-title">Poster Preview</h2>
                    <SeminarPosterDownloadPanel
                        title={posterTitle}
                        abstract={posterAbstract}
                        date={posterDate}
                        place={posterPlace}
                        prerequisite={posterPrerequisite}
                        speaker={posterSpeaker}
                    />
                </li>
            </ol>
            <div class="paper-actions">
                <button class="paper-btn primary" disabled={processing}>
                    {processing ? '처리 중...' : '수정 완료'}
                </button>
                <a href="/" class="paper-btn secondary">취소</a>
            </div>
        </form>
    {/if}
</article>

<style>
    .seminar-paper {
        width: min(100%, 54rem);
        margin: 1.1rem auto;
        padding: 1rem 1rem 1.12rem;
        background: var(--latex-bg);
        border: 1px solid var(--latex-rule);
        border-top-width: 2px;
        color: var(--latex-text);
    }

    form {
        width: 100%;
    }

    .field {
        margin-bottom: 1.45rem;
    }
    
    label,
    .label-text {
        display: block;
        margin-bottom: 0.42rem;
        font-family: var(--font-mono);
        font-size: 0.72rem;
        font-weight: 650;
        letter-spacing: 0.11em;
        text-transform: uppercase;
        color: var(--latex-muted);
    }

    .req {
        color: var(--latex-accent);
    }

    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.55rem;
    }

    .toggle-btn,
    .btn {
        border: 1px solid var(--latex-rule);
        border-radius: 0;
        background: transparent;
        color: var(--latex-text);
        font-family: var(--font-mono);
        font-weight: 640;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        transition: background-color 0.16s ease, color 0.16s ease;
    }

    .toggle-btn {
        padding: 0.38rem 0.75rem;
        font-size: 0.66rem;
    }

    .toggle-btn:hover {
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .toggle-btn:disabled,
    .toggle-btn:disabled:hover {
        background: #e9e9e9;
        color: var(--latex-muted);
        cursor: not-allowed;
    }

    input,
    textarea {
        width: 100%;
        padding: 0.7rem 0.76rem;
        border: 1px solid var(--latex-rule);
        border-radius: 0;
        background: var(--latex-bg);
        color: var(--latex-text);
        font-family: var(--font-body);
        font-size: 0.98rem;
        line-height: 1.5;
        resize: vertical;
    }

    input::placeholder,
    textarea::placeholder {
        color: var(--latex-muted);
    }

    input:focus-visible,
    textarea:focus-visible,
    .toggle-btn:focus-visible,
    .btn:focus-visible,
    .remove-tag:focus-visible,
    .result-item:focus-visible {
        outline: 2px solid var(--latex-accent);
        outline-offset: 2px;
    }

    .speaker-selection {
        background: var(--latex-bg);
        border: 1px solid var(--latex-rule);
        padding: 0.78rem;
        min-height: 3rem;
    }

    .selected-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
    }

    .speaker-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.42rem;
        padding: 0.31rem 0.52rem;
        border: 1px solid var(--latex-rule);
        background: transparent;
        color: var(--latex-text);
        font-size: 0.85rem;
        font-family: var(--font-body);
    }

    .speaker-tag .name {
        font-weight: 550;
    }

    .speaker-tag .info {
        color: var(--latex-muted);
        font-size: 0.73rem;
    }

    .remove-tag {
        width: 1.1rem;
        height: 1.1rem;
        border: 1px solid var(--latex-rule);
        border-radius: 0;
        background: transparent;
        color: var(--latex-text);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 0.66rem;
        line-height: 1;
        padding: 0;
    }

    .remove-tag:hover {
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .search-container {
        position: relative;
        width: 100%;
    }

    .results-dropdown {
        position: absolute;
        top: calc(100% + 0.36rem);
        left: 0;
        width: 100%;
        max-height: 14.5rem;
        overflow-y: auto;
        border: 1px solid var(--latex-rule);
        background: var(--latex-bg);
        z-index: 20;
    }

    .result-item {
        width: 100%;
        text-align: left;
        border: 0;
        border-bottom: 1px solid var(--latex-rule);
        background: transparent;
        color: inherit;
        padding: 0.72rem 0.8rem;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.18rem;
        transition: background-color 0.14s ease;
    }

    .result-item:last-child {
        border-bottom: 0;
    }

    .result-item:hover {
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .result-item:hover .r-email,
    .result-item:hover .r-dept {
        color: inherit;
    }

    .main-info {
        display: flex;
        align-items: center;
        gap: 0.45rem;
    }

    .r-name {
        font-family: var(--font-display);
        font-weight: 540;
    }

    .r-dept {
        font-family: var(--font-mono);
        font-size: 0.66rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--latex-muted);
    }

    .r-email {
        font-family: var(--font-mono);
        font-size: 0.73rem;
        color: var(--latex-muted);
    }

    .hint {
        margin: 0.34rem 0 0;
        color: var(--latex-muted);
        font-size: 0.83rem;
        line-height: 1.45;
        font-style: normal;
    }

    .btn {
        width: 100%;
        padding: 0.85rem 0.9rem;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        box-sizing: border-box;
        font-size: 0.74rem;
    }

    .home {
        margin-top: 0.7rem;
        border-color: var(--latex-rule);
    }

    .home:hover {
        border-color: var(--latex-text);
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .success-message {
        padding: 1rem 0 0.4rem;
        border-top: 2px solid var(--latex-rule);
        border-bottom: 1px solid var(--latex-rule);
    }
    
    .success-message h3 {
        margin: 0;
        color: var(--latex-text);
        font-family: var(--font-display);
        font-size: clamp(1.22rem, 3vw, 1.6rem);
        font-weight: 550;
        line-height: 1.34;
    }

    .success-message p {
        margin: 0.64rem 0 0;
        color: var(--latex-muted);
        line-height: 1.5;
    }

    .text-break {
        display: inline-block;
    }

    .processing-container {
        border-top: 2px solid var(--latex-rule);
        border-bottom: 1px solid var(--latex-rule);
        padding: 0.95rem 0;
    }

    .processing-card {
        position: relative;
        border: 1px solid var(--latex-rule);
    }

    .processing-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.55rem;
        background: color-mix(in srgb, var(--latex-bg) 88%, transparent);
    }

    .processing-overlay p {
        margin: 0;
        font-weight: 540;
        font-family: var(--font-display);
        font-size: 1.08rem;
        color: var(--latex-text);
    }

    .spinner {
        width: 1.15rem;
        height: 1.15rem;
        border: 2px solid var(--latex-rule);
        border-right-color: transparent;
        border-radius: 0;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    @media (max-width: 620px) {
        .seminar-paper {
            margin: 1rem auto;
            padding: 1.2rem 1rem 1.35rem;
        }

        .label-row {
            flex-direction: column;
            align-items: flex-start;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .toggle-btn,
        .btn,
        .result-item {
            transition: none;
        }

        .spinner {
            animation: none;
        }
    }
</style>
