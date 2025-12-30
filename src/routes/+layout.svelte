<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { signOut } from '@auth/sveltekit/client';

	let { children } = $props();
	const session = $derived($page.data.session);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="global-nav">
	<div class="nav-content">
		<div class="nav-left">
			<a href="/" class="logo-btn" aria-label="Home">
				<img src={favicon} alt="SNUMPS" />
			</a>
			{#if session?.user}
				<a href="/profile" class="profile-btn" aria-label="내 프로필">
					<img src={favicon} alt="Profile" />
				</a>
			{/if}
		</div>
		<div class="nav-right">
			{#if session?.user}
				<button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
			{/if}
		</div>
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
		justify-content: space-between;
	}

	.nav-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.nav-right {
		display: flex;
		align-items: center;
		gap: 1rem;
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

	.profile-btn {
		display: block;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
		border: 1px solid #e5e7eb;
		transition: transform 0.2s;
	}
	
	.profile-btn:hover {
		transform: scale(1.1);
	}

	.profile-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.logout-btn {
		font-size: 0.8rem;
		padding: 0.3rem 0.6rem;
		background: transparent;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		color: #4b5563;
		cursor: pointer;
	}

	.logout-btn:hover {
		background: #f3f4f6;
		color: #1f2937;
	}
</style>
