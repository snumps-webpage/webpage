<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';

    let { data } = $props();
    let isAttend = $derived(data.actionType === 'attend');
</script>

<div class="container">
    <div class="card">
        <h1>{data.event.title}</h1>
        <div class="meta">
            <span class="type">{data.event.type}</span>
            <span class="date">{new Date(data.event.date).toLocaleString()}</span>
        </div>

        <p class="user-info">
            참가자: <strong>{data.user?.name}</strong> ({data.user?.email})
        </p>

        <form method="POST" action={isAttend ? '?/attend' : '?/leave'} use:enhance={() => {
            return ({ result }) => {
                if (result.type === 'success') {
                    if (result.data?.error) {
                        alert(result.data.message || '오류가 발생했습니다.');
                    } else {
                        alert(isAttend ? '출석이 확인되었습니다.' : '퇴장이 확인되었습니다.');
                    }
                } else if (result.type === 'failure') {
                    alert('처리 중 오류가 발생했습니다.');
                } else if (result.type === 'error') {
                    alert('서버 오류가 발생했습니다.');
                }
            };
        }}>
            {#if isAttend}
                <button class="btn attend">출석하기 (Attend)</button>
            {:else}
                <button class="btn leave">퇴장하기 (Leave)</button>
            {/if}
        </form>
    </div>
</div>

<style>
    .container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f3f4f6;
        padding: 1rem;
    }

    .card {
        background: white;
        padding: 3rem;
        border-radius: 16px;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 400px;
        width: 100%;
    }

    h1 { margin: 0 0 1rem; color: #111827; }

    .meta {
        margin-bottom: 2rem;
        color: #6b7280;
        font-size: 0.9rem;
    }

    .type {
        background: #e5e7eb;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        margin-right: 0.5rem;
    }

    .user-info {
        margin-bottom: 2rem;
        padding: 1rem;
        background: #f9fafb;
        border-radius: 8px;
        font-size: 0.9rem;
        color: #4b5563;
    }

    .btn {
        width: 100%;
        padding: 1rem;
        border: none;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.1s;
    }

    .btn:active { transform: scale(0.98); }

    .attend {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
    }

    .leave {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
    }
</style>
