<script lang="ts">
    import { enhance } from '$app/forms';
    import { toasts } from '$lib/toasts';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import SuccessScreen from '$lib/components/SuccessScreen.svelte';
    import { MANUSCRIPT } from '$lib/constants';

    let { data } = $props();
    let processing = $state(false);
    let success = $state(false);
</script>

<article class="paper-document event-paper">
    <ManuscriptHeader 
        title={data.event.title} 
        subtitle="Attendance Submission Sheet" 
        figure={MANUSCRIPT.FIGURES.ATTENDANCE}
    />

	{#if success}
        <SuccessScreen 
            title="출석이 완료되었습니다!" 
            description="성공적으로 처리되었습니다. 창을 닫으셔도 됩니다." 
            buttonLabel="홈으로 이동"
        />
	{:else}
		<ol class="paper-sections">
			<li class="paper-section">
				<h2 class="paper-section-title">Event Metadata</h2>
				<div class="meta">
					<span class="type">{data.event.type}</span>
					<span class="date">{new Date(data.event.date).toLocaleString()}</span>
				</div>
				<p class="paper-status-note muted">
					참가자: <strong>{data.user?.name}</strong> ({data.user?.email})
				</p>
			</li>
		</ol>
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
			<div class="paper-actions">
				<button class="paper-btn primary" disabled={processing}>
					{#if processing}
						<span class="spinner"></span> 처리 중...
					{:else}
						출석 체크 (Check In)
					{/if}
				</button>
			</div>
		</form>
	{/if}
</article>

<style>
	.event-paper {
		width: min(100%, 42rem);
	}

    .meta {
        margin: 0.3rem 0 0.55rem;
        color: var(--text-secondary);
        font-size: 0.82rem;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.4rem;
    }

    .type {
        background: transparent;
        color: var(--text-secondary);
        padding: 0.16rem 0.44rem;
        font-weight: 650;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.65rem;
        font-family: var(--font-mono);
        border: 1px solid var(--border-color);
    }

	.date {
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

    .spinner {
        width: 0.9rem;
        height: 0.9rem;
        border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
        border-top-color: currentColor;
        border-radius: 0;
        animation: spin 1s linear infinite;
        display: inline-block;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

</style>
