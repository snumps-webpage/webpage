<script lang="ts">
	let { title, subtitle = "", figure = "" } = $props();
</script>

<header class="paper-document-header">
    {#if figure}
        <p class="paper-figure-label no-sel">{figure}</p>
    {/if}
	<h1 class="paper-document-title no-sel">{title}</h1>
	{#if subtitle}
		<p class="paper-document-subtitle no-sel">{subtitle}</p>
	{/if}
</header>

<style>
	.paper-document-header {
		margin-bottom: 2rem;
		border-top: 2px solid var(--latex-rule);
		border-bottom: 1px solid var(--latex-rule);
		padding: 0.95rem 0 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

    .paper-figure-label {
        margin: 0 0 0.2rem;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--latex-muted);
    }

	.paper-document-title {
		margin: 0;
		color: var(--latex-text);
		font-family: var(--font-display);
		font-weight: 550;
		letter-spacing: 0.01em;
		font-size: clamp(1.45rem, 2.8vw, 2.05rem);
		line-height: 1.2;
	}

	.paper-document-subtitle {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--latex-muted);
	}
</style>
