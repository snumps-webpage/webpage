<script lang="ts">
    import { enhance } from '$app/forms';
    let { data } = $props();
</script>

<div class="container">
    <h1>새 이벤트 만들기</h1>
    
    <form method="POST" use:enhance>
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

        <div class="actions">
            <a href="/admin" class="btn cancel">취소</a>
            <button class="btn submit">발행</button>
        </div>
    </form>
</div>

<style>
    .container {
        max-width: 600px;
        margin: 2rem auto;
        padding: 2rem;
        background: var(--bg-secondary);
        border-radius: 8px;
        box-shadow: var(--shadow);
        border: 1px solid var(--border-color);
    }
    
    h1 { margin-top: 0; color: var(--text-primary); }

    .field { margin-bottom: 1.5rem; flex: 1; }

    .field-row {
        display: flex;
        gap: 1rem;
    }
    
    label { 
        display: block; 
        margin-bottom: 0.5rem; 
        font-weight: 600; 
        color: var(--text-secondary);
    }

    input, select {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        font-size: 1rem;
        background: var(--bg-primary);
        color: var(--text-primary);
        box-sizing: border-box;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 2rem;
    }

    .btn {
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        font-size: 1rem;
        border: none;
        user-select: none;
    }

    .cancel {
        background: var(--btn-secondary);
        color: var(--text-secondary);
    }
    
    .cancel:hover { background: var(--border-color); }

    .submit {
        background: #667eea;
        color: white;
    }

    .submit:hover { opacity: 0.9; }
</style>
