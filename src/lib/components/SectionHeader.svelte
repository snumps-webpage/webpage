<script lang="ts">
	let { title, refreshing = false, loading = false, onRefresh, ariaLabel = "Refresh data" } = $props();
</script>

<div class="section-header">
	<h2 class="no-sel">{title}</h2>
	{#if onRefresh}
		<button 
			class="refresh-btn" 
			onclick={onRefresh} 
			disabled={refreshing || loading} 
			aria-label={ariaLabel}
		>
			<span class="refresh-icon" class:spinning={refreshing}>🔄</span>
		</button>
	{/if}
</div>

<style>
	.section-header {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		margin-bottom: 1rem;
	}

	.section-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 2vw, 1.34rem);
		font-weight: 540;
		color: var(--latex-text);
	}

	.refresh-btn {
		width: 1.9rem;
		height: 1.9rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.92rem;
		padding: 0;
		border: 1px solid var(--latex-rule);
		background: transparent;
		cursor: pointer;
	}

	.refresh-icon {
		display: inline-block;
		line-height: 1;
	}

	.refresh-icon.spinning {
		animation: spin 1.05s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
