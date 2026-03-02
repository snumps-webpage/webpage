<script lang="ts">
    import type { SeminarSpeaker } from '$lib/types';
    
    let { 
        selectedSpeakers = $bindable([]), 
        members = [], 
        memberDirectoryUnavailable = false,
        showSearch = $bindable(false)
    }: {
        selectedSpeakers: SeminarSpeaker[];
        members: SeminarSpeaker[];
        memberDirectoryUnavailable: boolean;
        showSearch: boolean;
    } = $props();

    let searchQuery = $state('');
    let selectedSpeakerIds = $derived(new Set(selectedSpeakers.map(s => s.id)));

    let searchResults = $derived(
        searchQuery.trim() === '' 
            ? [] 
            : members.filter((m: SeminarSpeaker) => 
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

<div class="speaker-selector">
    <div class="label-row">
        <span class="paper-label">발표자 (Speakers)</span>
        {#if !memberDirectoryUnavailable}
            <button type="button" class="paper-btn small" onclick={() => showSearch = !showSearch}>
                {showSearch ? '검색 닫기' : '추가 (Add)'}
            </button>
        {/if}
    </div>

    <div class="selected-speakers">
        {#each selectedSpeakers as speaker (speaker.id)}
            <div class="speaker-tag">
                <span class="s-name">{speaker.name}</span>
                <span class="s-dept">{speaker.department}</span>
                <button type="button" class="remove-btn" onclick={() => removeSpeaker(speaker.id)} aria-label="Remove speaker">×</button>
            </div>
        {:else}
            <p class="paper-hint">발표자를 추가해주세요. (본인 포함 가능)</p>
        {/each}
    </div>

    {#if showSearch}
        <div class="search-area">
            <input 
                type="text" 
                class="search-input" 
                placeholder="이름, 학과, 또는 이메일로 검색..." 
                bind:value={searchQuery}
                autofocus
            />
            {#if searchResults.length > 0}
                <div class="search-results">
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

<style>
    .speaker-selector {
        display: grid;
        gap: 0.65rem;
    }

    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .selected-speakers {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        min-height: 2.2rem;
        padding: 0.45rem;
        border: 1px dashed var(--latex-rule);
    }

    .speaker-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0.5rem;
        background: var(--latex-text);
        color: var(--latex-bg);
        font-family: var(--font-mono);
        font-size: 0.72rem;
    }

    .s-dept {
        opacity: 0.85;
        font-size: 0.64rem;
    }

    .remove-btn {
        background: transparent;
        border: 0;
        color: inherit;
        cursor: pointer;
        padding: 0 0.1rem;
        font-size: 1rem;
        line-height: 1;
    }

    .search-area {
        position: relative;
        margin-top: 0.35rem;
    }

    .search-input {
        width: 100%;
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--latex-rule);
        background: var(--latex-bg);
        color: var(--latex-text);
        font-family: var(--font-body);
    }

    .search-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        border: 1px solid var(--latex-rule);
        background: var(--latex-bg);
        z-index: 20;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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
    }

    .result-item:hover {
        background: var(--latex-text);
        color: var(--latex-bg);
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
        font-size: 0.66rem;
        text-transform: uppercase;
        opacity: 0.8;
    }

    .r-email {
        font-size: 0.73rem;
        opacity: 0.7;
    }
</style>
