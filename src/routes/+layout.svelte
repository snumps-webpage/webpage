<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import instagram from '$lib/assets/instagram.svg';
	import menuIcon from '$lib/assets/menu.svg';
	import { browser } from '$app/environment';
	import { page, navigating } from '$app/state';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { signOut } from '@auth/sveltekit/client';
	import { getInitialTheme, applyTheme, type Theme } from '$lib/theme';
    import Toasts from '$lib/components/Toasts.svelte';

	let { children } = $props();
	const session = $derived(page.data.session);
	const isGuestLanding = $derived(!session?.user && page.url.pathname === '/');

	// Theme state
	let currentTheme = $state<Theme>(getInitialTheme());
	let isMobileMenuOpen = $state(false);

	$effect(() => {
		applyTheme(currentTheme);
	});

	$effect(() => {
		if (!browser) return;
		document.documentElement.classList.toggle('guest-landing', isGuestLanding);
		return () => document.documentElement.classList.remove('guest-landing');
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

<nav class="global-nav" class:guest-latex={isGuestLanding}>
	<div class="nav-content">
		{#if isGuestLanding}
			<div class="nav-left">
				<a href="/" class="guest-wordmark no-sel" aria-label="SNUMPS Home">
					<img src={favicon} alt="" aria-hidden="true" class="guest-logo-mark" />
				</a>
			</div>
			<div class="nav-right"></div>
		{:else}
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
		{/if}
	</div>

	{#if !isGuestLanding && isMobileMenuOpen}
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

<main class:guest-latex-main={isGuestLanding}>
	{@render children()}
</main>

<Toasts />

{#if isGuestLanding}
	<footer class="guest-latex-footer">
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
			<div class="theme-selector guest-theme-selector">
				<button class="theme-btn" class:active={currentTheme === 'light'} onclick={() => currentTheme = 'light'}>라이트</button>
				<span class="sep">|</span>
				<button class="theme-btn" class:active={currentTheme === 'dark'} onclick={() => currentTheme = 'dark'}>다크</button>
				<span class="sep">|</span>
				<button class="theme-btn" class:active={currentTheme === 'system'} onclick={() => currentTheme = 'system'}>시스템</button>
			</div>
		</div>
	</footer>
{:else}
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
{/if}

<style>
		:root {
			/* Header Height for sticky elements */
			--nav-height: 4.1rem;
	
			/* Academic paper palette */
			--color-bg: #f8f5ee;
			--color-surface: #fcfbf8;
			--color-primary: #1f2730;
			--color-secondary: #4b4036;
			--color-accent: #7c2d12;
			
			--color-text-primary: #1f2730;
			--color-text-secondary: #5c646d;
			--color-text-muted: #737d87;
			
			--color-border: #cfc8bb;
			--color-btn-secondary: #efebe3;
	
			--color-success: #1f6d3b;
			--color-success-bg: #e8f5ea;
			--color-error: #8a1d1d;
			--color-error-bg: #fceceb;
			--color-warning: #9a6900;
			--color-warning-bg: #fff8dc;
	
			--color-brand-gradient: linear-gradient(90deg, #1f2730 0%, #626a74 100%);
			--color-bg-gradient: radial-gradient(circle at 50% 0%, #fffdf8 0%, #f8f5ee 60%, #f1ece1 100%);

			/* Guest landing LaTeX palette */
			--latex-bg: #f4f4f4;
			--latex-text: #111111;
			--latex-muted: #4a4a4a;
			--latex-rule: #1a1a1a;
			--latex-accent: #b22222;
			--latex-side-mark: rgba(17, 17, 17, 0.22);
	
			/* Legacy support/internal aliases */
			--bg-paper: var(--color-bg);
			--bg-primary: var(--color-bg); 
			--bg-secondary: var(--color-surface); 
			--text-primary: var(--color-text-primary);
			--text-secondary: var(--color-text-secondary);
			--border-color: var(--color-border);
			--btn-secondary: var(--color-btn-secondary);
			--bg-gradient: var(--color-bg-gradient);
			--brand-gradient: var(--color-brand-gradient);
			--color-success-text: var(--color-success);
			--color-danger-bg: var(--color-error-bg);
			--color-danger-text: var(--color-error);
			--color-warning-text: var(--color-warning);
	
			/* Refined Shadows */
			--shadow:
				0 1px 2px -1px rgba(0, 0, 0, 0.08),
				0 4px 12px -2px rgba(42, 47, 53, 0.06);
	
			/* Typography */
			--font-body: "Computer Modern Serif", "CMU Serif", "Latin Modern Roman", "STIX Two Text", "Gowun Batang", serif;
			--font-display: "Computer Modern Serif", "CMU Serif", "Latin Modern Roman", "STIX Two Text", "Gowun Batang", serif;
			--font-math: "STIX Two Math", "STIX Two Text", "Cambria Math", serif;
			--font-mono: "JetBrains Mono", monospace;
		}
	
		:global(.dark) {
			--color-bg: #141519;
			--color-surface: #1b1c21;
			--color-primary: #d6dfeb;
			--color-secondary: #c8b8a8;
			--color-accent: #f2a97d;
	
			--color-text-primary: #e7e9ee;
			--color-text-secondary: #aeb4bf;
			--color-text-muted: #8b93a1;
	
			--color-border: #3a3d46;
			--color-btn-secondary: #23262e;
	
			--color-success: #90d6a8;
			--color-success-bg: #153021;
			--color-error: #f5abab;
			--color-error-bg: #401616;
			--color-warning: #f5d483;
			--color-warning-bg: #3d3215;
	
			--color-brand-gradient: linear-gradient(90deg, #d6dfeb 0%, #c8b8a8 100%);
			--color-bg-gradient: radial-gradient(circle at 50% 0%, #242731 0%, #141519 68%, #111217 100%);

			--latex-bg: #121212;
			--latex-text: #e8e8e8;
			--latex-muted: #b7b7b7;
			--latex-rule: #d0d0d0;
			--latex-accent: #ff7b7b;
			--latex-side-mark: rgba(232, 232, 232, 0.22);
	
			--shadow:
				0 6px 24px -3px rgba(0, 0, 0, 0.66),
				0 2px 8px -2px rgba(0, 0, 0, 0.5);
		}
		:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		background: var(--bg-primary);
		background-image:
			repeating-linear-gradient(
				to bottom,
				transparent 0,
				transparent 35px,
				rgba(93, 101, 111, 0.11) 35px,
				rgba(93, 101, 111, 0.11) 36px
			),
			var(--bg-gradient);
		background-attachment: fixed;
		background-size: 100% 36px, cover;
		height: 100%;
		margin: 0;
		padding: 0;
	}

	:global(html.dark) {
		background-image:
			repeating-linear-gradient(
				to bottom,
				transparent 0,
				transparent 35px,
				rgba(255, 255, 255, 0.06) 35px,
				rgba(255, 255, 255, 0.06) 36px
			),
			var(--bg-gradient);
	}

	:global(html.guest-landing),
	:global(html.guest-landing.dark) {
		background: var(--latex-bg);
		background-image: none;
		scroll-snap-type: y mandatory;
	}

	:global(html.guest-landing body) {
		background: var(--latex-bg);
		color: var(--latex-text);
		scroll-snap-type: y mandatory;
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
		line-height: 1.68;
	}

	:global(h1), :global(h2), :global(h3), :global(h4), :global(h5), :global(h6) {
		font-family: var(--font-display);
		font-weight: 550;
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
		background: rgba(248, 245, 238, 0.92);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--border-color);
		padding: 0 1.5rem;
		height: var(--nav-height);
		display: flex;
		align-items: center;
		position: sticky;
		top: 0;
		z-index: 50;
		transition: border-color 0.3s, background-color 0.3s;
		box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
	}

	:global(.dark) .global-nav {
		background: rgba(20, 21, 25, 0.88);
	}

	.global-nav.guest-latex {
		background: var(--latex-bg);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 28%, transparent);
		box-shadow: none;
	}

	.global-nav.guest-latex .nav-content {
		max-width: 980px;
	}

	.guest-wordmark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.15rem;
		height: 1.15rem;
		text-decoration: none;
	}

	.guest-logo-mark {
		width: 0.98rem;
		height: 0.98rem;
		opacity: 0.82;
		filter: grayscale(1) contrast(0.86);
	}

	.guest-theme-selector {
		font-size: 0.72rem;
		gap: 0.3rem;
		color: var(--latex-muted);
	}

	.nav-link {
		background: none;
		border: none;
		font-family: var(--font-display);
		font-size: 1rem;
		font-style: italic;
		font-weight: 540;
		color: var(--text-primary);
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		border-radius: 2px;
		transition: background 0.2s;
		user-select: none;
        display: block;
	}

	.nav-link:hover {
		background: rgba(31, 39, 48, 0.08);
	}

	:global(.dark) .nav-link:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.circle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.9rem;
		height: 1.95rem;
		border-radius: 0;
		background: transparent;
		color: var(--text-primary);
		text-decoration: none;
		font-size: 0.72rem;
		font-weight: 600;
		font-family: var(--font-mono);
		border: 1px solid var(--border-color);
		transition: background 0.2s, color 0.2s;
		text-transform: uppercase;
		user-select: none;
		letter-spacing: 0.09em;
	}

	.circle-btn:hover {
		background: var(--text-primary);
		color: var(--bg-primary);
		border-color: var(--text-primary);
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

	main.guest-latex-main {
		background: var(--latex-bg);
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
		font-family: var(--font-mono);
		font-size: 0.72rem;
		transition: color 0.2s;
		padding: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
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

	@media (max-width: 900px) {
		:global(html.guest-landing),
		:global(html.guest-landing.dark),
		:global(html.guest-landing body) {
			scroll-snap-type: y proximity;
		}

		footer.guest-latex-footer .footer-content {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.55rem;
		}

		footer.guest-latex-footer .theme-selector {
			align-self: flex-end;
		}
	}

	@media (max-width: 620px) {
		:global(html.guest-landing),
		:global(html.guest-landing.dark),
		:global(html.guest-landing body) {
			scroll-snap-type: none;
		}

		.global-nav {
			padding: 0 0.9rem;
		}

		.global-nav.guest-latex .nav-content {
			max-width: 100%;
		}

		.guest-wordmark {
			width: 1rem;
			height: 1rem;
		}

		.guest-logo-mark {
			width: 0.9rem;
			height: 0.9rem;
		}

		footer.guest-latex-footer {
			padding: 0.78rem 0 calc(0.78rem + env(safe-area-inset-bottom));
		}

		footer.guest-latex-footer .footer-content {
			padding: 0 0.88rem;
		}

		footer.guest-latex-footer .footer-info p {
			font-size: 0.72rem;
			line-height: 1.42;
		}

		footer.guest-latex-footer .theme-selector {
			width: 100%;
			justify-content: flex-end;
			font-size: 0.66rem;
		}

		footer.guest-latex-footer .theme-btn {
			padding: 0.22rem 0.34rem;
			min-height: 1.75rem;
		}
	}

    /* Footer */
	footer {
		border-top: 1px solid var(--border-color);
		background: var(--bg-secondary);
		padding: 1.7rem 0;
		margin-top: auto;
	}

	footer.guest-latex-footer {
		border-top: 1px solid var(--latex-rule);
		background: var(--latex-bg);
		padding: 0.95rem 0;
	}

	footer.guest-latex-footer .footer-content {
		max-width: 980px;
		justify-content: space-between;
		padding: 0 1.2rem;
	}

	footer.guest-latex-footer .footer-info {
		color: var(--latex-muted);
	}

	footer.guest-latex-footer .footer-info p {
		font-size: 0.78rem;
		letter-spacing: 0.01em;
	}

	footer.guest-latex-footer .footer-info a {
		color: var(--latex-text);
		text-decoration: underline;
		text-underline-offset: 0.16em;
	}

	footer.guest-latex-footer .theme-selector {
		gap: 0.3rem;
		font-size: 0.7rem;
		color: var(--latex-muted);
	}

	footer.guest-latex-footer .theme-btn {
		padding: 0.16rem 0.3rem;
		border: 1px solid transparent;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	footer.guest-latex-footer .theme-btn:hover,
	footer.guest-latex-footer .theme-btn.active {
		background: var(--latex-text);
		color: var(--latex-bg);
		border-color: var(--latex-rule);
		text-decoration: none;
	}

	footer.guest-latex-footer .sep {
		opacity: 0.55;
		color: var(--latex-muted);
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
		filter: grayscale(1) contrast(0.45);
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
