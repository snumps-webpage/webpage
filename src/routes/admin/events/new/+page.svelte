<script lang="ts">
    import { enhance } from '$app/forms';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import { MANUSCRIPT } from '$lib/constants';
    let { data } = $props();
</script>

<div class="new-event-container">
    <ManuscriptHeader 
        title="새 이벤트 만들기" 
        subtitle="Event Draft Manuscript" 
        figure={MANUSCRIPT.FIGURES.EVENT_NEW}
    />
    
    <form method="POST" use:enhance>
        <ol class="paper-sections">
            <li class="paper-section">
                <h2 class="paper-section-title">Event Metadata</h2>
                <div class="paper-field">
                    <label for="title" class="paper-label">이벤트 제목</label>
                    <input type="text" id="title" name="title" required placeholder="예: 2025-1 개강총회" />
                </div>

                <div class="paper-field">
                    <label for="date" class="paper-label">일시</label>
                    <input type="datetime-local" id="date" name="date" required />
                </div>

                <div class="paper-field">
                    <label for="type" class="paper-label">활동 종류</label>
                    <select id="type" name="type" required class="paper-select">
                        {#each data.activityTypes as type (type)}
                            <option value={type}>{type}</option>
                        {/each}
                    </select>
                </div>
            </li>
        </ol>

        <div class="actions">
            <a href="/admin" class="btn cancel">취소</a>
            <button class="btn submit">발행</button>
        </div>
    </form>
</div>

<style>
    .new-event-container {
        width: min(100%, 38rem);
        margin: 1.4rem auto;
        padding: 1.2rem 1.1rem 1.35rem;
        background: var(--latex-bg);
        border: 1px solid var(--latex-rule);
        border-top-width: 2px;
    }

    .paper-select {
        width: 100%;
        padding: 0.7rem 0.76rem;
        border: 1px solid var(--latex-rule);
        border-radius: 0;
        background: var(--latex-bg);
        color: var(--latex-text);
        font-family: var(--font-body);
        font-size: 0.98rem;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.45rem;
        margin-top: 1.2rem;
        border-top: 1px solid var(--latex-rule);
        padding-top: 0.75rem;
    }

    .btn {
        padding: 0.56rem 0.92rem;
        border: 1px solid var(--latex-text);
        font-weight: 640;
        cursor: pointer;
        text-decoration: none;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: var(--font-mono);
        background: transparent;
        color: var(--latex-text);
        user-select: none;
    }

    .cancel {
        border-color: var(--latex-rule);
        color: var(--latex-muted);
    }
    
    .cancel:hover {
        border-color: var(--latex-text);
        color: var(--latex-text);
    }

    .submit {
        background: var(--latex-text);
        color: var(--latex-bg);
    }

    .submit:hover {
        background: transparent;
        color: var(--latex-text);
    }
</style>
