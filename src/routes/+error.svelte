<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="error-container">
	<div class="paper-document error-paper stagger-1">
		<header class="error-header">
			<div class="error-code no-sel">{page.status}</div>
			<h1 class="error-title">
				{#if page.status === 404}
					NOT FOUND
				{:else if page.status === 403}
					FORBIDDEN
				{:else}
					INTERNAL ERROR
				{/if}
			</h1>
			<p class="error-subtitle">
				{#if page.status === 404}
					THE REQUESTED RESOURCE DOES NOT EXIST.
				{:else if page.status === 403}
					ACCESS TO THIS RESOURCE IS RESTRICTED.
				{:else}
					AN UNEXPECTED ANOMALY HAS OCCURRED.
				{/if}
			</p>
		</header>

		<section class="error-body">
			<p class="error-message">
				{page.error?.message || 'We apologize for the inconvenience. Please return to the main dashboard or contact an executive if this persists.'}
			</p>
		</section>

		<footer class="error-actions">
			<a href="/" class="paper-btn primary">Return to Dashboard</a>
			<button class="paper-btn secondary" onclick={() => history.back()}>Go Back</button>
		</footer>
	</div>

	<div class="error-background-mark no-sel stagger-2" aria-hidden="true">
		{page.status}
	</div>
</div>

<style>
	.error-container {
		min-height: 80vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		position: relative;
		overflow: hidden;
	}

	.error-paper {
		position: relative;
		z-index: 10;
		max-width: 32rem;
		border-top-width: 3px;
		text-align: center;
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
	}

	.error-header {
		margin-bottom: 2rem;
	}

	.error-code {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--latex-accent);
		letter-spacing: 0.2em;
		margin-bottom: 0.5rem;
	}

	.error-title {
		margin: 0;
		font-size: 1.8rem;
		font-style: italic;
		letter-spacing: 0.05em;
	}

	.error-subtitle {
		margin: 0.4rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-secondary);
		letter-spacing: 0.1em;
	}

	.error-body {
		padding: 1.5rem 0;
		border-top: 1px solid var(--border-color);
		border-bottom: 1px solid var(--border-color);
		margin-bottom: 2rem;
	}

	.error-message {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--text-primary);
	}

	.error-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}

	.error-background-mark {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 35vw;
		font-family: var(--font-math);
		color: var(--text-primary);
		opacity: 0.03;
		pointer-events: none;
		white-space: nowrap;
		z-index: 1;
	}

	@media (max-width: 620px) {
		.error-title {
			font-size: 1.5rem;
		}

		.error-actions {
			flex-direction: column;
		}

		.error-actions .paper-btn {
			width: 100%;
		}
	}
</style>
