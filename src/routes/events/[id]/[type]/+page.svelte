<script lang="ts">
    import { enhance } from '$app/forms';
    import { toasts } from '$lib/toasts';

    let { data } = $props();
    let processing = $state(false);
    let success = $state(false);
</script>

<div class="container">
    <div class="card">
        {#if success}
            <div class="success-message">
                <h1>✅ 출석 완료</h1>
                <p>출석이 성공적으로 처리되었습니다.</p>
                <div class="meta">
                    <span class="type">{data.event.type}</span>
                    <span class="date">{new Date(data.event.date).toLocaleString()}</span>
                </div>
                <p class="hint">창을 닫으셔도 됩니다.</p>
            </div>
        {:else}
            <h1>{data.event.title}</h1>
            <div class="meta">
                <span class="type">{data.event.type}</span>
                <span class="date">{new Date(data.event.date).toLocaleString()}</span>
            </div>

            <p class="user-info">
                참가자: <strong>{data.user?.name}</strong> ({data.user?.email})
            </p>

            <form method="POST" action="?/attend" use:enhance={() => {
                processing = true;
                return async ({ result }) => {
                    processing = false;
                    if (result.type === 'success') {
                        if (result.data?.error) {
                            toasts.error((result.data.message as string) || '오류가 발생했습니다.');
                        } else {
                            success = true;
                        }
                    } else if (result.type === 'failure') {
                        toasts.error('처리 중 오류가 발생했습니다.');
                    } else if (result.type === 'error') {
                        toasts.error('서버 오류가 발생했습니다.');
                    }
                };
            }}>
                <button class="btn attend" disabled={processing}>
                    {#if processing}
                        <span class="spinner"></span> 처리 중...
                    {:else}
                        출석 체크 (Check In)
                    {/if}
                </button>
            </form>
        {/if}
    </div>
</div>

<style>
    .container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-primary);
        padding: 1.5rem;
        animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .card {
        background: var(--bg-secondary);
        padding: 3.5rem 2.5rem;
        border-radius: 8px;
        box-shadow: var(--shadow);
        text-align: center;
        max-width: 450px;
        width: 100%;
        border: 1px solid var(--border-color);
    }

    h1 { 
        margin: 0 0 1rem; 
        color: var(--text-primary); 
        font-family: var(--font-display);
        font-weight: 600;
        font-style: italic;
        font-size: 2rem;
    }

    .meta {
        margin-bottom: 2.5rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
        font-family: var(--font-body);
        font-style: italic;
    }

    .type {
        background: var(--bg-primary);
        color: var(--text-secondary);
        padding: 0.25rem 0.6rem;
        border-radius: 3px;
        margin-right: 0.5rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-size: 0.7rem;
        font-family: var(--font-mono);
        border: 1px solid var(--border-color);
    }

    .user-info {
        margin-bottom: 2.5rem;
        padding: 1.25rem;
        background: var(--bg-primary);
        border-radius: 4px;
        font-size: 0.9rem;
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        font-family: var(--font-body);
    }
    
    .user-info strong { font-family: var(--font-display); font-style: italic; font-size: 1.1rem; }

    .btn {
        width: 100%;
        padding: 1.25rem;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }

    .btn:active:not(:disabled) { transform: scale(0.98); }
    .btn:disabled { opacity: 0.7; cursor: not-allowed; }

    .attend {
        background: var(--text-primary);
        color: var(--bg-primary);
        box-shadow: var(--shadow);
    }
    .attend:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 20px -6px rgba(0,0,0,0.2); }

    .spinner {
        width: 1rem;
        height: 1rem;
        border: 2px solid rgba(var(--bg-primary), 0.3);
        border-top-color: currentColor;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        display: inline-block;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .success-message h1 {
        color: var(--color-success-text);
        margin-bottom: 1.5rem;
    }

    .success-message .hint {
        color: var(--text-secondary);
        font-size: 0.85rem;
        font-style: italic;
        margin-top: 2.5rem;
        font-family: var(--font-body);
    }

    @keyframes slide-up-fade {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
