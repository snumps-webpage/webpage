<script lang="ts">
    import { enhance } from '$app/forms';

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
                            alert(result.data.message || '오류가 발생했습니다.');
                        } else {
                            success = true;
                        }
                    } else if (result.type === 'failure') {
                        alert('처리 중 오류가 발생했습니다.');
                    } else if (result.type === 'error') {
                        alert('서버 오류가 발생했습니다.');
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
        padding: 1rem;
    }

    .card {
        background: var(--bg-secondary);
        padding: 3rem;
        border-radius: 8px; /* Sharper */
        box-shadow: var(--shadow);
        text-align: center;
        max-width: 400px;
        width: 100%;
        border: 1px solid var(--border-color);
    }

    h1 { 
        margin: 0 0 1rem; 
        color: var(--text-primary); 
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
        font-weight: 700;
    }

    .meta {
        margin-bottom: 2rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
        font-family: "Inter", "Noto Sans KR", sans-serif;
    }

    .type {
        background: var(--btn-secondary);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        margin-right: 0.5rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.75rem;
    }

    .user-info {
        margin-bottom: 2rem;
        padding: 1rem;
        background: var(--bg-primary);
        border-radius: 4px;
        font-size: 0.85rem;
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        font-family: var(--font-mono);
    }

    .btn {
        width: 100%;
        padding: 1rem;
        border: none;
        border-radius: 4px;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
        user-select: none;
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .btn:active:not(:disabled) { transform: scale(0.98); }
    .btn:disabled { opacity: 0.7; cursor: not-allowed; }

    .attend {
        background: var(--brand-gradient);
        color: white;
    }

    .spinner {
        width: 1rem;
        height: 1rem;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        display: inline-block;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .success-message h1 {
        color: var(--color-success-text);
        margin-bottom: 1rem;
    }

    .success-message .hint {
        color: var(--text-secondary);
        font-size: 0.9rem;
        font-style: italic;
        margin-top: 2rem;
    }
</style>
