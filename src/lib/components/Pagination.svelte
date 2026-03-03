<script lang="ts">
	let { controller } = $props();
</script>

{#if controller.totalPages > 1}
	<div class="pagination">
		<button class="page-btn" disabled={controller.page === 1} onclick={() => controller.prev()}>이전</button>
		{#each controller.pageNumbers as p (p)}
			<button class:active={controller.page === p} onclick={() => controller.goTo(p)} class="page-btn">{p}</button>
		{/each}
		<button class="page-btn" disabled={controller.page === controller.totalPages} onclick={() => controller.next()}>다음</button>
	</div>
{/if}

<style>
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 1.05rem;
	}

	.page-btn {
		padding: 0.4rem 0.64rem;
		font-size: 0.66rem;
		border: 1px solid var(--latex-rule);
		background: transparent;
		color: var(--latex-text);
		cursor: pointer;
		font-family: var(--font-mono);
	}

	.page-btn.active {
		background: var(--latex-text);
		color: var(--latex-bg);
	}

	.page-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
