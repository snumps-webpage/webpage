<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
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

	function toggleTheme() {
		if (currentTheme === 'light') currentTheme = 'dark';
		else if (currentTheme === 'dark') currentTheme = 'system';
		else currentTheme = 'light';
	}

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
					<img src="/src/lib/assets/instagram.svg" alt="Instagram" class="social-icon" />
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
		--bg-primary: #f8fafc; /* Slightly cooler gray for modern feel */
		--bg-secondary: #ffffff;
		--text-primary: #1e293b; /* Slate-900 */
		--text-secondary: #64748b; /* Slate-500 */
		--border-color: #e2e8f0; /* Slate-200 */
		--btn-secondary: #f1f5f9; /* Slate-100 */
		--shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025); /* Softer, diffuse shadow */
		
		/* Status Colors */
		--color-success-bg: #dcfce7;
		--color-success-text: #166534;
		--color-danger-bg: #fee2e2;
		--color-danger-text: #991b1b;
		--color-warning-bg: #fef3c7;
		--color-warning-text: #92400e;
	}

	:global(.dark) {
		--bg-primary: #0f172a; /* Slate-950 */
		--bg-secondary: #1e293b; /* Slate-800 */
		--text-primary: #f8fafc;
		--text-secondary: #94a3b8;
		--border-color: #334155;
		--btn-secondary: #334155;
		--shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);

		/* Status Colors (Dark Mode) */
		--color-success-bg: #064e3b;
		--color-success-text: #a7f3d0;
		--color-danger-bg: #7f1d1d;
		--color-danger-text: #fca5a5;
		--color-warning-bg: #78350f;
		--color-warning-text: #fcd34d;
	}

	:global(body) {
		margin: 0;
		font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; /* Prefer Inter if available */
		background: var(--bg-primary);
		color: var(--text-primary);
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		transition: background-color 0.3s, color 0.2s;
		-webkit-font-smoothing: antialiased; /* Smoother fonts */
	}

	.global-nav {
		background: rgba(255, 255, 255, 0.8); /* Translucent for glass effect */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border-color);
		padding: 0.75rem 1.5rem;
		position: sticky;
		top: 0;
		z-index: 50;
		transition: background-color 0.3s;
	}

	:global(.dark) .global-nav {
		background: rgba(30, 41, 59, 0.8); /* Dark translucent */
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

	.nav-menus {
		display: flex;
		align-items: center;
		margin: 0 4rem; /* Balanced margins for the entire menu group */
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
		user-select: none; /* Prevent text selection */
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
		user-select: none; /* Prevent text selection */
		
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
		user-select: none;
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
		user-select: none;
	}

	.logout-btn:hover {
		background: var(--btn-secondary);
		color: var(--text-primary);
	}

	/* Footer */
	footer {
		margin-top: auto;
		padding: 2rem 1.5rem;
		border-top: 1px solid var(--border-color);
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
		gap: 1rem;
	}

	.footer-info p { margin: 0; }

	.footer-info a {
		color: var(--text-secondary);
		text-decoration: none;
	}

	.footer-info a:hover {
		text-decoration: underline;
	}

	.theme-selector {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-secondary);
		opacity: 0.8;
	}

	.theme-btn {
		background: none;
		border: none;
		padding: 0;
		color: inherit;
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		transition: color 0.2s;
	}

	.theme-btn:hover { color: var(--text-primary); }
	.theme-btn.active { font-weight: 700; color: var(--text-primary); text-decoration: underline; }

	.sep { font-size: 0.7rem; opacity: 0.5; }

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
		background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
		transform-origin: left;
		animation: progress 1s infinite linear;
	}

	@keyframes progress {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}
</style>
