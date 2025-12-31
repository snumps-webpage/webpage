<script lang="ts">
    import { enhance } from '$app/forms';
    let { data, form } = $props();

    let searchQuery = $state('');
    let selectedSpeakers = $state<any[]>([]); // Objects from data.members

    let searchResults = $derived(
        searchQuery.trim() === '' 
            ? [] 
            : data.members.filter((m: any) => 
                !selectedSpeakers.find(s => s.id === m.id) &&
                (m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                 m.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
                 m.email.toLowerCase().includes(searchQuery.toLowerCase()))
            ).slice(0, 5) // Limit results
    );

    function addSpeaker(member: any) {
        selectedSpeakers = [...selectedSpeakers, member];
        searchQuery = '';
    }

    function removeSpeaker(id: string) {
        selectedSpeakers = selectedSpeakers.filter(s => s.id !== id);
    }
</script>

<div class="container">
    <h1>세미나 개설 신청</h1>
    
    {#if form?.success}
        <div class="success-message">
            <h3>✅ 신청이 완료되었습니다!</h3>
            <p>관리자 검토 후 결과가 이메일로 전송됩니다.</p>
            <a href="/" class="btn home">홈으로 돌아가기</a>
        </div>
    {:else}
        <form method="POST" use:enhance>
            {#if form?.error}
                <div class="error-banner">{form.error}</div>
            {/if}

            <div class="field">
                <label for="title">세미나 주제</label>
                <input type="text" id="title" name="title" required placeholder="예: 대수위상 세미나" />
            </div>

            <div class="field">
                <label for="date">예상 시작일</label>
                <input type="date" id="date" name="date" required />
            </div>

            <div class="field">
                <label for="speaker-search">발표자 (Speaker)</label>
                <div class="speaker-selection">
                    {#if selectedSpeakers.length > 0}
                        <div class="selected-list">
                            {#each selectedSpeakers as speaker (speaker.id)}
                                <div class="speaker-tag">
                                    <span class="name">{speaker.name}</span>
                                    <span class="info">{speaker.department}</span>
                                    <button type="button" onclick={() => removeSpeaker(speaker.id)} aria-label="Remove">✕</button>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="hint">지정하지 않을 경우 신청자 본인이 발표자가 됩니다.</p>
                    {/if}

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
        margin: 3rem auto;
        padding: 2rem;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    h1 { margin: 0 0 1.5rem 0; color: #111827; }

    .field { margin-bottom: 1.5rem; }
    
    label { 
        display: block; 
        margin-bottom: 0.5rem; 
        font-weight: 600; 
        color: #374151;
    }

    input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 1rem;
    }

    /* Speaker Selection */
    .speaker-selection {
        background: #f9fafb;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
    }

    .selected-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .speaker-tag {
        background: #667eea;
        color: white;
        padding: 0.4rem 0.75rem;
        border-radius: 20px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
    }

    .speaker-tag .info {
        opacity: 0.8;
        font-size: 0.75rem;
    }

    .speaker-tag button {
        background: rgba(0,0,0,0.1);
        border: none;
        color: white;
        cursor: pointer;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
    }

    .search-container {
        position: relative;
    }

    .results-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        margin-top: 0.25rem;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        z-index: 10;
        max-height: 200px;
        overflow-y: auto;
    }

    .result-item {
        width: 100%;
        text-align: left;
        padding: 0.75rem 1rem;
        border: none;
        background: none;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        display: flex;
        flex-direction: column;
    }

    .result-item:hover { background: #f0f4ff; }
    .result-item:last-child { border-bottom: none; }

    .main-info { display: flex; align-items: center; gap: 0.5rem; }
    .r-name { font-weight: 600; color: #111827; }
    .r-dept { font-size: 0.75rem; color: #6b7280; }
    .r-email { font-size: 0.75rem; color: #9ca3af; }

    .hint {
        font-size: 0.85rem;
        color: #6b7280;
        margin-bottom: 0.75rem;
    }

    .btn {
        width: 100%;
        padding: 0.875rem;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        transition: opacity 0.2s;
        text-align: center;
        text-decoration: none;
        display: inline-block;
    }

    .submit { background: #111827; color: white; margin-top: 1rem; }
    .submit:hover { opacity: 0.9; }
    
    .home { background: #f3f4f6; color: #374151; margin-top: 1rem; }

    .error-banner {
        background: #fee2e2;
        color: #991b1b;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
    }

    .success-message {
        text-align: center;
        padding: 2rem 0;
    }
</style>
