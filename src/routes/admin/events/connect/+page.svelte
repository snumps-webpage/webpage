<script lang="ts">
    import { enhance } from '$app/forms';
    import { getSemesterKeyFromDate } from '$lib/utils';
    import type { PageData } from './$types';

    let { data } = $props();
    
    let searchQuery = $state('');
    let selectedSemester = $state('all');
    let selectedEvent: any = $state(null);

    let filteredActivities = $derived(
        data.activities.filter((a: any) => {
            const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
            
            let matchesSemester = true;
            if (selectedSemester !== 'all') {
                const sem = getSemesterKeyFromDate(a.date);
                matchesSemester = (sem === selectedSemester);
            }
            
            return matchesSearch && matchesSemester;
        })
    );

    function selectEvent(event: any) {
        selectedEvent = event;
    }
</script>

<div class="container">
    <h1>기존 이벤트 연결하기</h1>
    <p class="desc">Notion에 이미 등록된 활동을 선택하여 출석 페이지를 생성합니다.</p>

    <div class="filter-bar">
        <div class="search-box">
            <input type="text" bind:value={searchQuery} placeholder="이벤트 명 검색..." />
        </div>
        <select bind:value={selectedSemester} class="semester-select">
            <option value="all">전체 학기</option>
            {#each data.semesters as sem (sem)}
                <option value={sem}>{sem}학기</option>
            {/each}
        </select>
    </div>

    <div class="list-container">
        {#if filteredActivities.length === 0}
            <p class="empty">검색 결과가 없습니다.</p>
        {:else}
            <div class="event-grid">
                {#each filteredActivities as activity (activity.id)}
                    <button 
                        class="event-card" 
                        class:selected={selectedEvent?.id === activity.id}
                        onclick={() => selectEvent(activity)}
                    >
                        <span class="type-tag">{activity.type}</span>
                        <span class="event-name">{activity.name}</span>
                        <span class="event-date">{new Date(activity.date).toLocaleDateString()}</span>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <div class="footer-actions">
        <a href="/admin" class="btn abort">취소</a>
        
        <form method="POST" action="?/publish" use:enhance>
            {#if selectedEvent}
                <input type="hidden" name="notionPageId" value={selectedEvent.id} />
                <input type="hidden" name="title" value={selectedEvent.name} />
                <input type="hidden" name="date" value={selectedEvent.date} />
                <input type="hidden" name="type" value={selectedEvent.type} />
            {/if}
            <button class="btn publish" disabled={!selectedEvent}>발행</button>
        </form>
    </div>
</div>

<style>
    .container {
        max-width: 1000px;
        margin: 2rem auto;
        padding: 2rem;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    h1 { margin: 0 0 0.5rem 0; color: #111827; }
    .desc { color: #6b7280; margin-bottom: 2rem; }

    .filter-bar {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .search-box { flex: 1; }
    .search-box input {
        width: 100%;
        padding: 0.75rem 1rem;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 1rem;
    }

    .semester-select {
        padding: 0.75rem 2rem 0.75rem 1rem;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        background: white;
    }

    .list-container {
        height: 400px;
        overflow-y: auto;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 1rem;
        background: #f9fafb;
        margin-bottom: 2rem;
    }

    .event-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
    }

    .event-card {
        background: white;
        border: 2px solid transparent;
        border-radius: 8px;
        padding: 1rem;
        text-align: left;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        transition: all 0.2s;
    }

    .event-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .event-card.selected { border-color: #667eea; background: #f0f4ff; }

    .type-tag {
        font-size: 0.7rem;
        font-weight: 700;
        background: #e5e7eb;
        color: #4b5563;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        width: fit-content;
    }

    .event-name { font-weight: 600; color: #1f2937; line-height: 1.4; }
    .event-date { font-size: 0.8rem; color: #6b7280; }

    .footer-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }

    .btn {
        padding: 0.75rem 2rem;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        text-decoration: none;
    }

    .abort { background: #f3f4f6; color: #374151; }
    .publish { background: #667eea; color: white; }
    .publish:disabled { background: #d1d5db; cursor: not-allowed; }

    .empty { text-align: center; color: #9ca3af; padding: 4rem; }
</style>
