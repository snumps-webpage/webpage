<script lang="ts">
	let { 
		title = "완료되었습니다", 
		description = "", 
		buttonLabel = "홈으로 돌아가기", 
		buttonLink = "/" 
	} = $props();
</script>

<div class="paper-status-note success success-screen">
	<h3 class="success-title">{title}</h3>
	{#if description}
		<p class="success-desc">{description}</p>
	{/if}
	<div class="paper-actions">
		<a href={buttonLink} class="paper-btn primary">{buttonLabel}</a>
	</div>
</div>

<style>
	.success-screen {
		text-align: center;
		padding: 2.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
	}

	.success-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.2rem, 3vw, 1.6rem);
		font-weight: 550;
	}

	.success-desc {
		margin: 0;
		color: var(--latex-muted);
		line-height: 1.5;
	}

	.paper-actions {
		margin-top: 1rem;
		border-top: none;
		padding-top: 0;
	}
</style>
