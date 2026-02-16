<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import instagram from '$lib/assets/instagram.svg';
	import menuIcon from '$lib/assets/menu.svg';
	import { page, navigating } from '$app/state';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { signOut } from '@auth/sveltekit/client';
	import { getInitialTheme, applyTheme, type Theme } from '$lib/theme';
    import Toasts from '$lib/components/Toasts.svelte';

	let { children } = $props();
	const session = $derived(page.data.session);

	// Theme state
	let currentTheme = $state<Theme>(getInitialTheme());
	let isMobileMenuOpen = $state(false);

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

	afterNavigate(() => {
		isMobileMenuOpen = false;
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
				<div class="nav-menus desktop-only">
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
				<div class="desktop-only nav-actions">
					{#if page.data.isAdmin}
						<a href="/admin" class="circle-btn">Admin</a>
						<a href="/notion" class="circle-btn">DB</a>
					{/if}
				</div>
				<button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
				<button 
					class="mobile-menu-toggle mobile-only" 
					onclick={() => isMobileMenuOpen = !isMobileMenuOpen}
					aria-label="Toggle menu"
				>
					<img src={menuIcon} alt="" />
				</button>
			{/if}
		</div>
	</div>

	{#if isMobileMenuOpen}
		<div class="mobile-dropdown mobile-only stagger-1">
			<div class="mobile-dropdown-content">
				<div class="mobile-group">
					<span class="group-label">Seminar</span>
					<a href="/seminar/apply" class="mobile-link">세미나 개설</a>
				</div>
				{#if page.data.isAdmin}
					<div class="mobile-group">
						<span class="group-label">Admin</span>
						<a href="/admin" class="mobile-link">관리자 대시보드</a>
						<a href="/notion" class="mobile-link">Notion 데이터베이스</a>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</nav>

<main>
	{@render children()}
</main>

<Toasts />

<footer>
	<div class="footer-content">
		<div class="footer-info">
			<p>
				<span class="no-sel">회장:</span> {page.data.presidentName} | 
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
		/* Header Height for sticky elements */
		--nav-height: 4rem;

		/* "Math Journal" Aesthetic */
		--bg-paper: #fdfbf7;
		--bg-primary: var(--bg-paper); 
		--bg-secondary: #f4f1ea; 
		
		/* Deep, Rich Ink Colors */
		--text-primary: #2a2f35; /* Soft Charcoal */
		--text-secondary: #5f666d; /* Graphite */
		--border-color: #d8d4cd; /* Aged paper edge */
		--btn-secondary: #ebe7e0;
		
		/* Atmospheric Gradients */
		--bg-gradient: radial-gradient(circle at 50% 0%, #fffefc 0%, #fdfbf7 60%, #f4f1ea 100%);
		
		/* Refined Shadows - Soft, diffused ambient light */
		--shadow: 
			0 1px 2px -1px rgba(0, 0, 0, 0.08),
			0 4px 12px -2px rgba(42, 47, 53, 0.06); 
		
		/* Status Colors - Muted Ink Tones */
		--color-success-bg: #e8f5e9;
		--color-success-text: #1b5e20;
		--color-danger-bg: #ffebee;
		--color-danger-text: #b71c1c;
		--color-warning-bg: #fffde7;
		--color-warning-text: #f57f17;
		
		/* Brand - "Academic Crimson" & "Oxford Blue" */
		--brand-gradient: linear-gradient(135deg, #1a365d 0%, #3e2723 100%);
		
		/* Typography - Distinctive & Editorial */
		--font-body: "Crimson Pro", "Gowun Batang", serif;
		--font-display: "Newsreader", "Gowun Batang", serif;
		--font-mono: "JetBrains Mono", monospace;
	}

	:global(.dark) {
		--bg-paper: #1c1c1e;
		--bg-primary: #1c1c1e;
		--bg-secondary: #252528;
		
		--text-primary: #e6e6e6;
		--text-secondary: #a1a1aa;
		--border-color: #3f3f42;
		--btn-secondary: #2c2c2e;
		
		--bg-gradient: radial-gradient(circle at 50% 0%, #2c2c2e 0%, #1c1c1e 70%, #151516 100%);
		
		--shadow: 
			0 4px 20px -2px rgba(0, 0, 0, 0.6),
			0 2px 8px -2px rgba(0, 0, 0, 0.4);

		/* Dark Mode Ink Tones */
		--color-success-bg: #052e16;
		--color-success-text: #86efac;
		--color-danger-bg: #450a0a;
		--color-danger-text: #fca5a5;
		--color-warning-bg: #422006;
		--color-warning-text: #fcd34d;
		
		--brand-gradient: linear-gradient(135deg, #a5b4fc 0%, #fca5a5 100%);
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		background: var(--bg-primary);
		background-image: var(--bg-gradient);
		background-attachment: fixed;
		background-size: cover;
		height: 100%;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		font-family: var(--font-body);
		color: var(--text-primary);
		display: flex;
		flex-direction: column;
		min-height: 100%;
		transition: color 0.2s;
		-webkit-font-smoothing: antialiased;
		line-height: 1.6;
	}

	:global(h1), :global(h2), :global(h3), :global(h4), :global(h5), :global(h6) {
		font-family: var(--font-display);
		font-weight: 600; /* Lighter weight for elegance */
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}

	/* Staggered Animation Utilities */
	:global(.stagger-1) { animation: slide-up-fade 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both; }
	:global(.stagger-2) { animation: slide-up-fade 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both; }
	:global(.stagger-3) { animation: slide-up-fade 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both; }

	@keyframes slide-up-fade {
		from { opacity: 0; transform: translateY(12px); }
		to { opacity: 1; transform: translateY(0); }
	}

	:global(.no-sel) {
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		user-select: none;
	}

	.global-nav {
		background: rgba(253, 251, 247, 0.85); /* Glassy Paper */
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-bottom: 1px solid var(--border-color); /* Thinner, refined border */
		padding: 0 1.5rem;
		height: var(--nav-height);
		display: flex;
		align-items: center;
		position: sticky;
		top: 0;
		z-index: 50;
		transition: border-color 0.3s;
	}

	:global(.dark) .global-nav {
		background: rgba(28, 28, 30, 0.85);
	}

	.nav-link {
		background: none;
		border: none;
		font-family: var(--font-display); /* Serif nav */
		font-size: 1.05rem;
		font-style: italic; /* Editorial touch */
		font-weight: 500;
		color: var(--text-primary);
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		border-radius: 4px; 
		transition: all 0.2s;
		user-select: none;
        display: block;
	}

	.circle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1.2rem;
		height: 2.25rem;
		border-radius: 9999px; /* Full pill */
		background: transparent;
		color: var(--text-primary);
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 600;
		font-family: var(--font-mono); /* Technical contrast */
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
		transform: translateY(-1px);
	}

    /* Update other font usages to vars */
	.footer-info p { 
		margin: 0; 
		font-family: var(--font-body);
		font-size: 0.9rem;
	}

	.theme-selector {
		font-family: var(--font-mono);
	}

    /* --- RESTORED STRUCTURAL CSS --- */
    main {
        flex: 1;
        width: 100%;
    }

    .nav-content {
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .nav-left, .nav-right {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .logo-btn {
        display: flex;
        align-items: center;
        text-decoration: none;
        user-select: none;
    }
    
    .logo-btn img {
        height: 1.5rem;
        width: auto;
    }

    .nav-menus {
        display: flex;
        gap: 1rem;
        margin-left: 1rem;
    }

    .nav-actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
    }

    /* Dropdown Logic */
    .dropdown {
        position: relative;
        display: inline-block;
        height: 100%;
    }

    .dropdown-content {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        background-color: var(--bg-secondary);
        min-width: 160px;
        box-shadow: var(--shadow);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        z-index: 100;
        padding: 0.5rem 0;
        animation: slide-up-fade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .dropdown-content a {
        color: var(--text-primary);
        padding: 0.75rem 1rem;
        text-decoration: none;
        display: block;
        font-family: var(--font-body);
        font-size: 0.95rem;
    }

    .dropdown-content a:hover {
        background-color: var(--bg-primary);
    }

    /* Hover based dropdown */
    .dropdown:hover .dropdown-content {
        display: block;
    }

    .logout-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-family: var(--font-body);
        font-size: 0.9rem;
        transition: color 0.2s;
        padding: 0.5rem;
    }
    .logout-btn:hover { color: var(--color-danger-text); }

    /* Mobile Menu Toggle */
    .mobile-menu-toggle {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
    }

    .mobile-menu-toggle img {
        height: 1.25rem;
        width: 1.25rem;
    }

    :global(.dark) .mobile-menu-toggle img {
        filter: invert(1);
    }

    /* Mobile Dropdown */
    .mobile-dropdown {
        position: absolute;
        top: var(--nav-height);
        left: 0;
        right: 0;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        box-shadow: var(--shadow);
        z-index: 40;
        padding: 1.5rem;
    }

    .mobile-dropdown-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .mobile-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .group-label {
        font-family: var(--font-display);
        font-style: italic;
        font-size: 0.8rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.25rem;
        margin-bottom: 0.25rem;
    }

    .mobile-link {
        color: var(--text-primary);
        text-decoration: none;
        font-family: var(--font-body);
        font-size: 1.1rem;
        padding: 0.5rem 0;
    }

    /* Utilities */
    .desktop-only { display: flex; }
    .mobile-only { display: none; }

    @media (max-width: 768px) {
        .desktop-only { display: none !important; }
        .mobile-only { display: flex !important; }
        
        .nav-right {
            gap: 0.5rem;
        }
    }

    /* Footer */
    footer {
        border-top: 1px solid var(--border-color);
        background: var(--bg-secondary);
        padding: 2rem 0;
        margin-top: auto;
    }

    .footer-content {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
    }

    .footer-info {
        color: var(--text-secondary);
    }
    
    .footer-info a {
        color: var(--text-primary);
        text-decoration: none;
    }

    .social-link {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        margin-left: 0.5rem;
    }

    .social-icon {
        width: 16px;
        height: 16px;
        opacity: 0.7;
        transition: opacity 0.2s;
        filter: contrast(0.5) sepia(1) hue-rotate(200deg); /* Adjust for ink aesthetic */
    }
    .social-link:hover .social-icon { opacity: 1; filter: none; }

    .theme-selector {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        color: var(--text-secondary);
    }

    .theme-btn {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        font-family: inherit;
        font-weight: 500;
    }

    .theme-btn:hover, .theme-btn.active {
        color: var(--text-primary);
        text-decoration: underline;
    }

    .sep { opacity: 0.3; }
    
    .loading-bar {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: transparent;
        z-index: 100;
        pointer-events: none;
    }

    .loading-progress {
        height: 100%;
        background: var(--brand-gradient);
        width: 50%;
        animation: loading 1s infinite ease-in-out;
    }

    @keyframes loading {
        0% { width: 0%; margin-left: 0; }
        50% { width: 70%; margin-left: 30%; }
        100% { width: 0%; margin-left: 100%; }
    }

</style>
