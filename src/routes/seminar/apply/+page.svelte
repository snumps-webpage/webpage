<script lang="ts">
    import { enhance } from '$app/forms';
    import Skeleton from '$lib/components/Skeleton.svelte';
    import type { SeminarSpeaker } from '$lib/types';

    let { data, form } = $props();

    let searchQuery = $state('');
    let selectedSpeakers = $state<SeminarSpeaker[]>([]); 
    let showSearch = $state(false); // Toggle for search UI
    let processing = $state(false);

    let selectedSpeakerIds = $derived(new Set(selectedSpeakers.map(s => s.id)));

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

<div class="container">
    <h1 class="no-sel">세미나 개설 신청</h1>
    
    {#if form?.success}
        <div class="success-message">
            <h3>신청이 완료되었습니다!</h3>
            <p>관리자 검토 후 결과가 이메일로 전송됩니다.</p>
            <a href="/" class="btn home">홈으로 돌아가기</a>
        </div>
    {:else if processing}
        <div class="processing-container">
            <div class="processing-card">
                <Skeleton height="300px" borderRadius="8px" />
                <div class="processing-overlay">
                    <div class="spinner"></div>
                    <p>신청서를 처리 중입니다...</p>
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
                <div class="error-banner">{form.error}</div>
            {/if}

            <div class="field">
                <label for="title" class="no-sel">세미나 주제 <span class="req">*</span></label>
                <input type="text" id="title" name="title" required placeholder="예: 대수위상 세미나" />
            </div>

            <div class="field">
                <label for="description" class="no-sel">세미나 설명 <span class="req">*</span></label>
                <textarea id="description" name="description" rows="4" required placeholder="세미나의 목적과 내용을 간략히 적어주세요."></textarea>
            </div>

            <div class="field">
                <label for="prerequisites" class="no-sel">선수 지식</label>
                <textarea id="prerequisites" name="prerequisites" rows="2" style="min-height: 5.5rem" placeholder="세미나를 듣기 위해 필요한 배경 지식이 있다면 적어주세요."></textarea>
            </div>

            <div class="field">
                <label for="duration" class="no-sel">예상 소요 시간 <span class="req">*</span></label>
                <input type="text" id="duration" name="duration" required placeholder="예: 90분" />
            </div>

            <div class="field">
                <label for="attachment" class="no-sel">첨부 파일</label>
                <input type="url" id="attachment" name="attachment" placeholder="Google Drive, Dropbox 링크 등 (선택 사항)" />
                <p class="hint no-sel">강의 자료나 계획서가 있다면 링크를 입력해주세요.</p>
            </div>

            <div class="field">
                <div class="label-row">
                    <span class="label-text no-sel">발표자</span>
                    <button type="button" class="toggle-btn" onclick={() => showSearch = !showSearch}>
                        {showSearch ? '닫기' : 'DB에서 검색/추가'}
                    </button>
                </div>
                
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

                    {#if showSearch}
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

            <button class="btn submit">신청하기</button>
        </form>
    {/if}
</div>

<style>
    .container {
        max-width: 600px;
        margin: 4rem auto;
        padding: 3rem;
        background: var(--bg-secondary);
        border-radius: 8px;
        box-shadow: var(--shadow);
        border: 1px solid var(--border-color);
        animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    h1 { 
        margin: 0 0 2rem 0; 
        color: var(--text-primary); 
        font-family: var(--font-display);
        font-weight: 600;
        text-align: center;
        font-style: italic;
        font-size: 2rem;
    }

    .field { margin-bottom: 2rem; }
    
    label, .label-text { 
        display: block; 
        font-weight: 700; 
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 0.5rem;
    }

    .req { color: var(--color-danger-text); }

    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .toggle-btn {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 0.4rem 0.8rem;
        border-radius: 4px;
        font-size: 0.7rem;
        cursor: pointer;
        color: var(--text-primary);
        user-select: none;
        font-weight: 600;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        transition: all 0.2s;
    }

    .toggle-btn:hover { background: var(--text-primary); color: var(--bg-primary); }

    input, textarea {
        width: 100%;
        padding: 0.85rem;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 1.05rem;
        box-sizing: border-box;
        background: var(--bg-primary);
        color: var(--text-primary);
        resize: none;
        font-family: var(--font-body);
        transition: border-color 0.2s;
    }

    input:focus, textarea:focus {
        outline: none;
        border-color: var(--text-primary);
    }

    /* Speaker Selection */
    .speaker-selection {
        background: var(--bg-primary);
        padding: 1rem;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        min-height: 3rem;
        display: flex;
        align-items: center;
    }

    .selected-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .speaker-tag {
        background: var(--text-primary);
        color: var(--bg-primary);
        padding: 0.4rem 0.75rem;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        user-select: none;
        font-family: var(--font-body);
        font-weight: 500;
    }

    .speaker-tag .info {
        opacity: 0.7;
        font-size: 0.75rem;
        font-style: italic;
    }

    .remove-tag {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        cursor: pointer;
        width: 18px;
        height: 18px;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        transition: background 0.2s;
    }

    .remove-tag:hover { background: rgba(255,255,255,0.4); }

    .search-container {
        position: relative;
        width: 100%;
    }

    .results-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        left: -1rem;
        width: calc(100% + 2rem);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        box-shadow: var(--shadow);
        z-index: 50;
        max-height: 250px;
        overflow-y: auto;
    }

    .result-item {
        width: 100%;
        text-align: left;
        padding: 1rem;
        border: none;
        background: none;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        display: flex;
        flex-direction: column;
        transition: background 0.2s;
    }

    .result-item:hover { background: var(--bg-primary); }
    .result-item:last-child { border-bottom: none; }

    .main-info { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .r-name { font-weight: 600; color: var(--text-primary); font-family: var(--font-display); font-style: italic; }
    .r-dept { font-size: 0.65rem; color: var(--text-secondary); background: var(--bg-secondary); padding: 0.2rem 0.5rem; border-radius: 3px; font-family: var(--font-mono); font-weight: 700; text-transform: uppercase;}
    .r-email { font-size: 0.8rem; color: var(--text-secondary); font-family: var(--font-mono); }

    .hint {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0;
        font-style: italic;
        font-family: var(--font-body);
    }

    .btn {
        width: 100%;
        padding: 1rem;
        border-radius: 4px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        user-select: none;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        box-sizing: border-box;
    }

    .submit { background: var(--text-primary); color: var(--bg-primary); margin-top: 1.5rem; }
    .submit:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
    
    .home { background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); margin-top: 1rem; }
    .home:hover { border-color: var(--text-primary); }

    .error-banner {
        background: var(--color-danger-bg);
        color: var(--color-danger-text);
        padding: 1rem;
        border-radius: 4px;
        margin-bottom: 2rem;
        text-align: center;
        font-family: var(--font-body);
        font-weight: 600;
    }

    .success-message {
        text-align: center;
        padding: 2rem 0;
        color: var(--text-primary);
    }
    
    .success-message h3 {
        font-family: var(--font-display);
        color: var(--color-success-text);
        font-style: italic;
        font-size: 1.5rem;
        margin-bottom: 1rem;
    }

    .processing-overlay p {
        margin: 0;
        font-weight: 600;
        color: var(--text-primary);
        font-family: var(--font-display);
        font-style: italic;
        font-size: 1.25rem;
    }

    @keyframes slide-up-fade {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
