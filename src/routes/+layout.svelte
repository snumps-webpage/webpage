<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import instagram from '$lib/assets/instagram.svg';
	import { page, navigating } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import { signOut } from '@auth/sveltekit/client';
	import { getInitialTheme, applyTheme, type Theme } from '$lib/theme';

	let { children } = $props();
	const session = $derived(page.data.session);

	// Theme state
	let currentTheme = $state<Theme>(getInitialTheme());

	$effect(() => {
		applyTheme(currentTheme);
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
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
	<title>서울대학교 수학문제연구회 SNUMPS</title>
</svelte:head>

{#if navigating.to}
	<div class="loading-bar">
		<div class="loading-progress"></div>
	</div>
{/if}

<nav class="global-nav">
	<div class="nav-content">
		<div class="nav-left">
			<a href="/" class="logo-btn" aria-label="Home">
				<img src={favicon} alt="SNUMPS" />
			</a>
			{#if session?.user}
				<div class="nav-menus">
					<div class="dropdown">
						<button class="nav-link">Seminar</button>
						<div class="dropdown-content">
							<a href="/seminar/apply">세미나 개설</a>
						</div>
					</div>
				</div>
			{/if}
		</div>
		<div class="nav-right">
			{#if session?.user}
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

<footer>
	<div class="footer-content">
		<div class="footer-info">
			<p>
				회장: {page.data.presidentName} | 
				<a href="mailto:snumps0@gmail.com">snumps0@gmail.com</a> |
				<a href="https://instagram.com/snu_mps" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Instagram">
					<img src={instagram} alt="Instagram" class="social-icon" />
				</a>
			</p>
		</div>
		<div class="theme-selector">
			<button class="theme-btn" class:active={currentTheme === 'light'} onclick={() => currentTheme = 'light'}>Light</button>
			<span class="sep">|</span>
			<button class="theme-btn" class:active={currentTheme === 'dark'} onclick={() => currentTheme = 'dark'}>Dark</button>
			<span class="sep">|</span>
			<button class="theme-btn" class:active={currentTheme === 'system'} onclick={() => currentTheme = 'system'}>System</button>
		</div>
	</div>
</footer>

<style>
	:root {
		/* Ivy League / Academic Theme */
		--bg-primary: #fdfbf7; /* Warm Paper */
		--bg-secondary: #f4f1ea; /* Darker Beige/Paper */
		--text-primary: #1c2b33; /* Deep Charcoal/Navy */
		--text-secondary: #5c6b73; /* Slate Grey */
		--border-color: #d1d5db; /* Classic Grey */
		--btn-secondary: #eae6db; /* Matches secondary bg */
		
		/* Refined Shadows - Flatter, more defined */
		--shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); 
		
		/* Status Colors - Slightly muted/classic */
		--color-success-bg: #e6fffa;
		--color-success-text: #2c7a7b;
		--color-danger-bg: #fff5f5;
		--color-danger-text: #c53030;
		--color-warning-bg: #fffaf0;
		--color-warning-text: #c05621;
		
		/* Brand - Deep Academic Navy/Teal */
		--brand-gradient: linear-gradient(135deg, #1b3a4b 0%, #2c5364 100%);
		--font-mono: "JetBrains Mono", monospace;
	}

	:global(.dark) {
		--bg-primary: #181a1b; /* Warm Black */
		--bg-secondary: #222426; /* Darker Warm Black */
		--text-primary: #e8e6e3; /* Off-white */
		--text-secondary: #b0b3b8; /* Grey */
		--border-color: #3f4245;
		--btn-secondary: #2c2e30;
		--shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);

		/* Status Colors (Dark Mode) */
		--color-success-bg: #064e3b;
		--color-success-text: #a7f3d0;
		--color-danger-bg: #7f1d1d;
		--color-danger-text: #fca5a5;
		--color-warning-bg: #78350f;
		--color-warning-text: #fcd34d;
		--brand-gradient: linear-gradient(135deg, #2c5364 0%, #1b3a4b 100%);
	}

	:global(body) {
		margin: 0;
		font-family: "Inter", "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
		background: var(--bg-primary);
		color: var(--text-primary);
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		transition: background-color 0.3s, color 0.2s;
		-webkit-font-smoothing: antialiased;
	}

	:global(h1), :global(h2), :global(h3), :global(h4), :global(h5), :global(h6) {
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	:global(.no-sel) {
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		user-select: none;
	}

	.global-nav {
		background: rgba(253, 251, 247, 0.9); /* Matches bg-primary with opacity */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 2px solid var(--border-color); /* Thicker classic border */
		padding: 0.75rem 1.5rem;
		position: sticky;
		top: 0;
		z-index: 50;
		transition: background-color 0.3s;
	}

	:global(.dark) .global-nav {
		background: rgba(24, 26, 27, 0.9);
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
		transform: scale(1.05);
	}

	.logo-btn img {
		width: 100%;
		height: 100%;
	}

	.nav-menus {
		display: flex;
		align-items: center;
		margin: 0 4rem;
	}

	/* Dropdown Menu */
	.dropdown {
		position: relative;
		display: inline-block;
	}

	.nav-link {
		background: none;
		border: none;
		font-family: "Playfair Display", "Nanum Myeongjo", serif; /* Serif for nav links */
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		border-radius: 4px; /* Sharper corners */
		transition: color 0.2s, background-color 0.2s;
		user-select: none;
	}

	.nav-link:hover {
		background-color: var(--btn-secondary);
	}

	.dropdown-content {
		position: absolute;
		top: 100%;
		left: 50%;
		background-color: var(--bg-secondary);
		width: max-content;
		box-shadow: var(--shadow);
		border-radius: 4px;
		border: 1px solid var(--border-color);
		z-index: 100;
		overflow: hidden;
		user-select: none;
		
		max-height: 0;
		opacity: 0;
		visibility: hidden;
		transform: translateX(-50%) scaleY(0.95);
		transform-origin: top;
		transition: 
			max-height 0.3s ease,
			transform 0.3s ease,
			opacity 0.2s ease;
	}

	.dropdown:hover .dropdown-content {
		max-height: 300px;
		opacity: 1;
		visibility: visible;
		transform: translateX(-50%) scaleY(1);
	}

	.dropdown-content a {
		color: var(--text-primary);
		padding: 0.75rem 1.25rem;
		text-decoration: none;
		display: block;
		font-size: 0.9rem;
		font-family: "Inter", "Noto Sans KR", sans-serif;
		transition: background-color 0.2s;
		border-bottom: 1px solid var(--border-color);
	}

	.dropdown-content a:last-child {
		border-bottom: none;
	}

	.dropdown-content a:hover {
		background-color: var(--btn-secondary);
	}

	.circle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1rem;
		height: 36px; /* Pill shape */
		border-radius: 4px; /* Classic Rect */
		background: var(--btn-secondary);
		color: var(--text-primary);
		text-decoration: none;
		font-size: 0.75rem;
		font-weight: 700;
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
		border: 1px solid var(--border-color);
		transition: all 0.2s;
		text-transform: uppercase;
		user-select: none;
		letter-spacing: 0.05em;
	}

	.circle-btn:hover {
		background: var(--text-primary);
		color: var(--bg-primary);
		border-color: var(--text-primary);
	}

	.logout-btn {
		font-size: 0.8rem;
		padding: 0.4rem 0.8rem;
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		color: var(--text-secondary);
		cursor: pointer;
		user-select: none;
		font-family: "Inter", "Noto Sans KR", sans-serif;
		font-weight: 500;
		transition: all 0.2s;
	}

	.logout-btn:hover {
		border-color: var(--text-primary);
		color: var(--text-primary);
	}

	/* Footer */
	footer {
		margin-top: auto;
		padding: 3rem 1.5rem;
		border-top: 2px solid var(--border-color);
		color: var(--text-secondary);
		font-size: 0.875rem;
		background: var(--bg-secondary);
	}

	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.footer-info p { 
		margin: 0; 
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
		font-size: 0.8rem;
	}

	.footer-info a[href^="mailto:"] {
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.footer-info a {
		color: var(--text-primary);
		text-decoration: none;
		border-bottom: 1px solid transparent;
		transition: border-color 0.2s;
	}

	.footer-info a:hover {
		text-decoration: none;
		border-bottom-color: var(--text-primary);
	}

	.theme-selector {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-secondary);
		opacity: 0.8;
		font-family: "Inter", "Noto Sans KR", sans-serif;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.theme-btn {
		background: none;
		border: none;
		padding: 0;
		color: inherit;
		cursor: pointer;
		font-size: inherit;
		font-weight: 500;
		transition: color 0.2s;
	}

	.theme-btn:hover { color: var(--text-primary); }
	.theme-btn.active { font-weight: 700; color: var(--text-primary); border-bottom: 1px solid currentColor; }

	.sep { font-size: 0.7rem; opacity: 0.3; }

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
	}

	.social-icon {
		width: 18px;
		height: 18px;
		filter: grayscale(1); /* Classic b&w look */
	}

	:global(.dark) .social-icon {
		filter: grayscale(1) invert(1);
	}

	/* View Transitions */
	::view-transition-old(page) {
		animation: 0.3s cubic-bezier(0.4, 0, 0.2, 1) both fade-out;
	}

	::view-transition-new(page) {
		animation: 0.3s cubic-bezier(0.4, 0, 0.2, 1) both fade-in;
	}

	@keyframes fade-in {
		from { opacity: 0; transform: translateY(5px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@keyframes fade-out {
		from { opacity: 1; transform: translateY(0); }
		to { opacity: 0; transform: translateY(-5px); }
	}

	/* Global Loading Bar */
	.loading-bar {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 3px;
		z-index: 9999;
		background: transparent;
		pointer-events: none;
	}

	.loading-progress {
		width: 100%;
		height: 100%;
		background: var(--brand-gradient);
		transform-origin: left;
		animation: progress 1s infinite linear;
	}

	@keyframes progress {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}
</style>
