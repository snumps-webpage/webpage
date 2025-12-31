<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { signOut } from '@auth/sveltekit/client';
	import { getInitialTheme, applyTheme, type Theme } from '$lib/theme';

	let { children } = $props();
	const session = $derived(page.data.session);

	// Theme state
	let currentTheme = $state<Theme>(getInitialTheme());

	$effect(() => {
		applyTheme(currentTheme);
	});

	function toggleTheme() {
		if (currentTheme === 'light') currentTheme = 'dark';
		else if (currentTheme === 'dark') currentTheme = 'system';
		else currentTheme = 'light';
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<script>
		// Inline script to prevent theme flicker on page load
		(function() {
			try {
				const theme = localStorage.getItem('theme') || 'system';
				const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
				if (isDark) document.documentElement.classList.add('dark');
			} catch (e) {}
		})();
	</script>
</svelte:head>

<nav class="global-nav">
	<div class="nav-content">
		<div class="nav-left">
			<a href="/" class="logo-btn" aria-label="Home">
				<img src={favicon} alt="SNUMPS" />
			</a>
			{#if session?.user}
				<div class="dropdown">
					<button class="nav-link">Seminar</button>
					<div class="dropdown-content">
						<a href="/seminar/apply">세미나 개설</a>
					</div>
				</div>
			{/if}
		</div>
		<div class="nav-right">
			{#if session?.user}
				<a href="/profile" class="profile-btn" aria-label="내 프로필">
					<img src={favicon} alt="Profile" />
				</a>
				{#if page.data.isAdmin}
					<a href="/admin" class="circle-btn">Admin</a>
					<a href="/notion" class="circle-btn">DB</a>
				{/if}
				<button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
			{/if}
		</div>
	</div>
</nav>

<main>
	{@render children()}
</main>

<button class="theme-toggle" onclick={toggleTheme} aria-label="Theme Toggle">
	{#if currentTheme === 'light'}
		☀️
	{:else if currentTheme === 'dark'}
		🌙
	{:else}
		🖥️
	{/if}
</button>

<footer>
	<div class="footer-info">
		<p>
			회장: {page.data.presidentName} | 
			<a href="mailto:snumps0@gmail.com">snumps0@gmail.com</a> |
			<a href="https://instagram.com/snu_mps" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Instagram">
				<img src="/src/lib/assets/instagram.svg" alt="Instagram" class="social-icon" />
			</a>
		</p>
	</div>
</footer>

<style>
	:root {
		--bg-primary: #f9fafb;
		--bg-secondary: #ffffff;
		--text-primary: #111827;
		--text-secondary: #4b5563;
		--border-color: #e5e7eb;
		--btn-secondary: #f3f4f6;
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	:global(.dark) {
		--bg-primary: #111827;
		--bg-secondary: #1f2937;
		--text-primary: #f9fafb;
		--text-secondary: #9ca3af;
		--border-color: #374151;
		--btn-secondary: #374151;
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
		background: var(--bg-primary);
		color: var(--text-primary);
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		transition: background-color 0.3s, color 0.2s;
	}

	.global-nav {
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border-color);
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

	/* Dropdown Menu */
	.dropdown {
		position: relative;
		display: inline-block;
	}

	.nav-link {
		background: none;
		border: none;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		cursor: pointer;
		padding: 0.5rem 0.5rem; /* Reduced horizontal padding */
		border-radius: 6px;
		transition: color 0.2s;
	}

	.dropdown-content {
		position: absolute;
		top: 100%;
		left: 50%; /* Align to middle */
		background-color: var(--bg-secondary);
		width: max-content; /* Fit exactly to content */
		box-shadow: var(--shadow);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		z-index: 100;
		overflow: hidden;
		
		/* Rolling Scroll Animation + Centering */
		max-height: 0;
		opacity: 0;
		visibility: hidden;
		transform: translateX(-50%) scaleY(0); /* Center and collapse */
		transform-origin: top;
		transition: 
			max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
			opacity 0.2s ease-out;
	}

	.dropdown:hover .dropdown-content {
		max-height: 300px;
		opacity: 1;
		visibility: visible;
		transform: translateX(-50%) scaleY(1); /* Center and expand */
	}

	.dropdown-content a {
		color: var(--text-primary);
		padding: 0.75rem 1rem;
		text-decoration: none;
		display: block;
		font-size: 0.9rem;
		transition: background-color 0.2s;
	}

	.dropdown-content a:hover {
		background-color: var(--btn-secondary);
	}

	.profile-btn {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
		border: 1px solid var(--border-color);
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

	.circle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--btn-secondary);
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 0.65rem;
		font-weight: 700;
		border: 1px solid var(--border-color);
		transition: all 0.2s;
		text-transform: uppercase;
	}

	.circle-btn:hover {
		background: var(--border-color);
		color: var(--text-primary);
		transform: scale(1.1);
	}

	.logout-btn {
		font-size: 0.8rem;
		padding: 0.3rem 0.6rem;
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.logout-btn:hover {
		background: var(--btn-secondary);
		color: var(--text-primary);
	}

	.theme-toggle {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		z-index: 100;
		transition: all 0.2s;
	}

	.theme-toggle:hover {
		transform: scale(1.1);
	}

	/* Footer */
	footer {
		margin-top: auto;
		padding: 2rem 1.5rem;
		border-top: 1px solid var(--border-color);
		display: flex;
		justify-content: center;
		color: var(--text-secondary);
		font-size: 0.875rem;
		background: var(--bg-secondary);
	}

	.footer-info a {
		color: var(--text-secondary);
		text-decoration: none;
	}

	.footer-info a:hover {
		text-decoration: underline;
	}

	.social-link {
		display: inline-flex;
		align-items: center;
		vertical-align: middle;
		margin-left: 0.5rem;
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.social-link:hover {
		opacity: 1;
		text-decoration: none !important;
	}

	.social-icon {
		width: 18px;
		height: 18px;
		filter: grayscale(1) invert(0.5);
	}

	:global(.dark) .social-icon {
		filter: grayscale(1) invert(1);
	}
</style>
