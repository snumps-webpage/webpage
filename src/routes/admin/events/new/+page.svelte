<script lang="ts">
    import { enhance } from '$app/forms';
    let { data } = $props();
</script>

<div class="container">
    <p class="figure-label no-sel">Figure A-New · Event Draft</p>
    <h1>새 이벤트 만들기</h1>
    
    <form method="POST" use:enhance>
        <ol class="paper-sections">
            <li class="paper-section">
                <h2 class="paper-section-title">Event Metadata</h2>
                <div class="field">
                    <label for="title">이벤트 제목</label>
                    <input type="text" id="title" name="title" required placeholder="예: 2025-1 개강총회" />
                </div>

                <div class="field">
                    <label for="date">일시</label>
                    <input type="datetime-local" id="date" name="date" required />
                </div>

                <div class="field">
                    <label for="type">활동 종류</label>
                    <select id="type" name="type" required>
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
    .container {
        width: min(100%, 38rem);
        margin: 1.4rem auto;
        padding: 1.2rem 1.1rem 1.35rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-top-width: 2px;
    }

    .figure-label {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.64rem;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }

    h1 {
        margin: 0.32rem 0 0.95rem;
        color: var(--text-primary);
        font-family: var(--font-display);
        font-style: italic;
        font-weight: 560;
        font-size: clamp(1.24rem, 2.5vw, 1.5rem);
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
    }

    .field { margin-bottom: 0.95rem; flex: 1; }
    
    label { 
        display: block; 
        margin-bottom: 0.34rem;
        font-family: var(--font-mono);
        font-size: 0.66rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        font-weight: 650;
        color: var(--text-secondary);
    }

    input, select {
        width: 100%;
        padding: 0.62rem 0.68rem;
        border: 1px solid var(--border-color);
        font-size: 0.93rem;
        background: var(--bg-primary);
        color: var(--text-primary);
        box-sizing: border-box;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.45rem;
        margin-top: 1.2rem;
        border-top: 1px solid var(--border-color);
        padding-top: 0.75rem;
    }

    .btn {
        padding: 0.56rem 0.92rem;
        border: 1px solid var(--text-primary);
        font-weight: 640;
        cursor: pointer;
        text-decoration: none;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: var(--font-mono);
        background: transparent;
        color: var(--text-primary);
        user-select: none;
    }

    .cancel {
        border-color: var(--border-color);
        color: var(--text-secondary);
    }
    
    .cancel:hover {
        border-color: var(--text-primary);
        color: var(--text-primary);
    }

    .submit {
        background: var(--text-primary);
        color: var(--bg-primary);
    }

    .submit:hover {
        background: transparent;
        color: var(--text-primary);
    }
</style>
