<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="global-nav">
	<div class="nav-content">
		<a href="/" class="logo-btn" aria-label="Home">
			<img src={favicon} alt="SNUMPS" />
		</a>
	</div>
</nav>

<main>
	{@render children()}
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
		background: #f9fafb;
	}

	.global-nav {
		background: white;
		border-bottom: 1px solid #e5e7eb;
		padding: 0.75rem 1.5rem;
		position: sticky;
		top: 0;
		z-index: 50;
	}

	.nav-content {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		align-items: center;
	}

	.logo-btn {
		display: block;
		width: 40px;
		height: 40px;
		transition: transform 0.2s;
	}

	.logo-btn:hover {
		transform: scale(1.1);
	}

	.logo-btn img {
		width: 100%;
		height: 100%;
	}
</style>
