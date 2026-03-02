<script lang="ts">
    import { enhance } from '$app/forms';
    import { getSemesterKeyFromDate } from '$lib/utils';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import StatusBadge from '$lib/components/StatusBadge.svelte';
    import type { NotionActivity } from '$lib/types';
    import { MANUSCRIPT } from '$lib/constants';

    let { data } = $props();
    
    let searchQuery = $state('');
    let selectedSemester = $state('all');
    let selectedEvent = $state<NotionActivity | null>(null);

    let filteredActivities = $derived(
        data.activities.filter((a: NotionActivity) => {
            const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
            
            let matchesSemester = true;
            if (selectedSemester !== 'all') {
                const sem = getSemesterKeyFromDate(a.date);
                matchesSemester = (sem === selectedSemester);
            }
            
            return matchesSearch && matchesSemester;
        })
    );

    function selectEvent(event: NotionActivity) {
        selectedEvent = event;
    }
</script>

<div class="connect-container">
    <ManuscriptHeader 
        title="기존 이벤트 연결하기" 
        subtitle="Existing Activity Index" 
        figure={MANUSCRIPT.FIGURES.EVENT_CONNECT}
    />
    <p class="desc">Notion에 이미 등록된 활동을 선택하여 출석 페이지를 생성합니다.</p>

    <ol class="paper-sections">
        <li class="paper-section">
            <h2 class="paper-section-title">Notion Activity Index</h2>
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
                                type="button"
                                class="event-card"
                                class:selected={selectedEvent?.id === activity.id}
                                onclick={() => selectEvent(activity)}
                            >
                                <StatusBadge status={activity.type} type="tag" />
                                <span class="event-name">{activity.name}</span>
                                <span class="event-date">{activity.date}</span>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </li>
    </ol>

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
    .connect-container {
        width: min(100%, 66rem);
        margin: 1.4rem auto;
        padding: 1.2rem 1.1rem 1.25rem;
        background: var(--latex-bg);
        border: 1px solid var(--latex-rule);
        border-top-width: 2px;
    }

    .desc {
        color: var(--latex-muted);
        margin: 0 0 0.82rem;
        padding-bottom: 0.65rem;
        border-bottom: 1px solid var(--latex-rule);
    }

    .filter-bar {
        display: flex;
        gap: 0.55rem;
        margin-bottom: 0.82rem;
    }

    .search-box { flex: 1; }

    .search-box input {
        width: 100%;
        padding: 0.58rem 0.64rem;
        border: 1px solid var(--latex-rule);
        font-size: 0.92rem;
        background: var(--latex-bg);
        color: var(--latex-text);
    }

    .semester-select {
        padding: 0.58rem 0.7rem;
        border: 1px solid var(--latex-rule);
        background: var(--latex-bg);
        color: var(--latex-text);
        font-family: var(--font-mono);
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }

    .list-container {
        height: min(54vh, 26rem);
        overflow-y: auto;
        border: 1px solid var(--latex-rule);
        padding: 0.75rem;
        background: var(--latex-bg);
        margin-bottom: 0.92rem;
    }

    .event-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 0.5rem;
    }

    .event-card {
        background: var(--latex-bg);
        border: 1px solid var(--latex-rule);
        border-left: 2px solid var(--latex-muted);
        padding: 0.65rem 0.72rem;
        text-align: left;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.36rem;
        transition: border-color 0.16s, background-color 0.16s;
        user-select: none;
    }

    .event-card:hover {
        border-color: var(--latex-text);
    }

    .event-card.selected {
        border-left-color: var(--latex-text);
        border-color: var(--latex-text);
        background: color-mix(in srgb, var(--latex-text) 4%, var(--latex-bg));
    }

    .event-name {
        font-weight: 550;
        color: var(--latex-text);
        line-height: 1.4;
        font-family: var(--font-display);
    }

    .event-date {
        font-size: 0.72rem;
        color: var(--latex-muted);
        font-family: var(--font-mono);
    }

    .footer-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.42rem;
        padding-top: 0.7rem;
        border-top: 1px solid var(--latex-rule);
    }

    .btn {
        padding: 0.55rem 0.88rem;
        font-weight: 640;
        font-size: 0.68rem;
        cursor: pointer;
        border: 1px solid var(--latex-text);
        text-decoration: none;
        user-select: none;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        background: transparent;
        color: var(--latex-text);
    }

    .abort {
        border-color: var(--latex-rule);
        color: var(--latex-muted);
    }

    .abort:hover {
        border-color: var(--latex-text);
        color: var(--latex-text);
    }

    .publish {
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .publish:hover:enabled {
        background: transparent;
        color: var(--latex-text);
    }

    .publish:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .empty {
        text-align: center;
        color: var(--latex-muted);
        padding: 2.4rem 1rem;
        border: 1px dashed var(--latex-rule);
    }

    @media (max-width: 768px) {
        .connect-container {
            padding: 1rem 0.85rem 1.05rem;
        }

        .filter-bar {
            flex-direction: column;
        }

        .semester-select {
            width: 100%;
        }
    }
</style>
