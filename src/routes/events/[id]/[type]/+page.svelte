<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';

    let { data } = $props();
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

        <form method="POST" action="?/attend" use:enhance={() => {
            return ({ result }) => {
                if (result.type === 'success') {
                    if (result.data?.error) {
                        alert(result.data.message || '오류가 발생했습니다.');
                    } else {
                        alert('출석이 완료되었습니다.');
                    }
                } else if (result.type === 'failure') {
                    alert('처리 중 오류가 발생했습니다.');
                } else if (result.type === 'error') {
                    alert('서버 오류가 발생했습니다.');
                }
            };
        }}>
            <button class="btn attend">출석 체크 (Check In)</button>
        </form>
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
        border-radius: 16px;
        box-shadow: var(--shadow);
        text-align: center;
        max-width: 400px;
        width: 100%;
        border: 1px solid var(--border-color);
    }

    h1 { margin: 0 0 1rem; color: var(--text-primary); }

    .meta {
        margin-bottom: 2rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
    }

    .type {
        background: var(--btn-secondary);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        margin-right: 0.5rem;
    }

    .user-info {
        margin-bottom: 2rem;
        padding: 1rem;
        background: var(--btn-secondary);
        border-radius: 8px;
        font-size: 0.9rem;
        color: var(--text-secondary);
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
        user-select: none;
    }

    .btn:active { transform: scale(0.98); }

    .attend {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
    }
</style>
