<script lang="ts">
    import { enhance } from '$app/forms';
    import Skeleton from '$lib/components/Skeleton.svelte';
    import type { SeminarSpeaker } from '$lib/types';
    import SpeakerSelector from '$lib/components/poster/SpeakerSelector.svelte';
    import SeminarPosterSection from '$lib/components/poster/SeminarPosterSection.svelte';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import SuccessScreen from '$lib/components/SuccessScreen.svelte';
    import { MANUSCRIPT } from '$lib/constants';

    let { data, form } = $props();

    let selectedSpeakers = $state<SeminarSpeaker[]>([]); 
    let showSearch = $state(false);
    let processing = $state(false);
    let seminarTitle = $state('');
    let seminarDescription = $state('');
    let seminarPrerequisites = $state('');
    let memberDirectoryUnavailable = $derived(!!data.memberDirectoryUnavailable);
</script>

<article class="paper-document">
    <ManuscriptHeader 
        title="세미나 개설 신청" 
        subtitle="세미나 신청서" 
        figure={MANUSCRIPT.FIGURES.SEMINAR_APPLY}
    />
    
    {#if form?.success}
        <SuccessScreen 
            title="신청이 완료되었습니다!" 
            description="관리자 검토 후 결과가 이메일로 전송됩니다." 
        />
    {:else if processing}
        <div class="processing-container">
            <div class="processing-card">
                <Skeleton height="300px" borderRadius="0" />
                <div class="processing-overlay">
                    <div class="spinner"></div>
                    <p>신청서를 처리 중입니다...</p>
                    <span class="paper-hint">잠시만 기다려주세요.</span>
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
                    <h2 class="paper-section-title">세미나 기본 정보</h2>
                    <div class="paper-field">
                        <label for="title" class="paper-label">세미나 주제 <span class="req">*</span></label>
                        <input type="text" id="title" name="title" bind:value={seminarTitle} required placeholder="예: 대수위상 세미나" />
                    </div>

                    <div class="paper-field">
                        <label for="description" class="paper-label">세미나 설명 <span class="req">*</span></label>
                        <textarea id="description" name="description" bind:value={seminarDescription} rows="4" required placeholder="세미나의 목적과 내용을 간략히 적어주세요."></textarea>
                    </div>

                    <div class="paper-field">
                        <label for="prerequisites" class="paper-label">선수 지식</label>
                        <textarea id="prerequisites" name="prerequisites" bind:value={seminarPrerequisites} rows="2" style="min-height: 5.5rem" placeholder="세미나를 듣기 위해 필요한 배경 지식이 있다면 적어주세요."></textarea>
                    </div>
                </li>
                <li class="paper-section">
                    <h2 class="paper-section-title">진행 정보</h2>
                    <div class="paper-field">
                        <label for="duration" class="paper-label">예상 소요 시간 <span class="req">*</span></label>
                        <input type="text" id="duration" name="duration" required placeholder="예: 90분" />
                    </div>

                    <div class="paper-field">
                        <label for="attachment" class="paper-label">첨부 파일</label>
                        <input type="url" id="attachment" name="attachment" placeholder="Google Drive, Dropbox 링크 등 (선택 사항)" />
                        <p class="paper-hint">강의 자료나 계획서가 있다면 링크를 입력해주세요.</p>
                    </div>
                </li>
                <li class="paper-section">
                    <SpeakerSelector 
                        bind:selectedSpeakers 
                        members={data.members} 
                        memberDirectoryUnavailable={memberDirectoryUnavailable}
                        bind:showSearch
                    />
                    <input type="hidden" name="speakerIds" value={JSON.stringify(selectedSpeakers.map(s => s.id))} />
                </li>
                <li class="paper-section">
                    <SeminarPosterSection 
                        {seminarTitle} 
                        {seminarDescription} 
                        {seminarPrerequisites} 
                        {selectedSpeakers} 
                        actualName={data.actualName}
                    />
                </li>
            </ol>
            <div class="paper-actions">
                <button class="paper-btn primary" disabled={processing}>
                    {processing ? '처리 중...' : '신청하기'}
                </button>
            </div>
        </form>
    {/if}
</article>

<style>
    .req {
        color: var(--latex-accent);
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

    @media (prefers-reduced-motion: reduce) {
        .spinner {
            animation: none;
        }
    }
</style>
