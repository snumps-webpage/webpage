<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import instagram from '$lib/assets/instagram.svg';
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

	$effect(() => {
		if (!browser) return;
		const root = document.documentElement;
		const body = document.body;
		const syncScrollbarComp = () => {
			const scrollbarComp = Math.max(0, window.innerWidth - body.offsetWidth);
			body.style.setProperty('--mobile-menu-scrollbar-comp', `${scrollbarComp}px`);
		};

		if (!isMobileMenuOpen) {
			root.classList.remove('mobile-menu-open');
			body.classList.remove('mobile-menu-open');
			body.style.setProperty('--mobile-menu-scrollbar-comp', '0px');
			return;
		}

		syncScrollbarComp();
		root.classList.add('mobile-menu-open');
		body.classList.add('mobile-menu-open');
		window.addEventListener('resize', syncScrollbarComp);
		return () => {
			window.removeEventListener('resize', syncScrollbarComp);
			root.classList.remove('mobile-menu-open');
			body.classList.remove('mobile-menu-open');
			body.style.setProperty('--mobile-menu-scrollbar-comp', '0px');
		};
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
		<div class="nav-left">
			<a href="/" class="guest-wordmark no-sel" aria-label="SNUMPS Home">
				<img src={favicon} alt="" aria-hidden="true" class="guest-logo-mark" />
			</a>
			{#if session?.user}
				<a href="/seminar/apply" class="paper-nav-link desktop-only">Seminar</a>
			{/if}
		</div>
		<div class="nav-right">
			{#if session?.user}
				<div class="desktop-only nav-actions">
					{#if page.data.isAdmin}
						<a href="/admin" class="circle-btn">Admin</a>
						<a href="/notion" class="circle-btn">DB</a>
					{/if}
					<button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
				</div>
					<button
						class="mobile-menu-toggle mobile-only"
						class:is-open={isMobileMenuOpen}
						onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
						aria-controls="mobile-nav-menu"
						aria-expanded={isMobileMenuOpen}
						aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
					>
						<span class="menu-glyph" aria-hidden="true">
							<span class="menu-line line-1"></span>
							<span class="menu-line line-2"></span>
							<span class="menu-line line-3"></span>
						</span>
					</button>
				{/if}
			</div>
		</div>

		{#if session?.user && isMobileMenuOpen}
			<div id="mobile-nav-menu" class="mobile-dropdown mobile-only stagger-1">
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
				<div class="mobile-group">
					<button class="mobile-logout-btn" onclick={() => signOut()}>로그아웃</button>
				</div>
			</div>
		</div>
	{/if}
</nav>

<main class:guest-latex-main={isGuestLanding}>
	{@render children()}
</main>

<Toasts />

<footer class="guest-latex-footer unified-footer">
	<div class="footer-content">
		<div class="footer-info">
			<p>
				<span class="footer-chip"><span class="no-sel">회장:</span> {page.data.presidentName}</span>
				<span class="footer-sep" aria-hidden="true">|</span>
				<a href="mailto:snumps0@gmail.com" class="footer-chip">snumps0@gmail.com</a>
				<span class="footer-sep" aria-hidden="true">|</span>
				<a
					href="https://instagram.com/snu_mps"
					target="_blank"
					rel="noopener noreferrer"
					class="social-link footer-chip"
					aria-label="Instagram"
				>
					<img src={instagram} alt="Instagram" class="social-icon" />
				</a>
			</p>
		</div>
		<div class="theme-selector guest-theme-selector">
			<button class="theme-btn" class:active={currentTheme === 'light'} onclick={() => (currentTheme = 'light')}>라이트</button>
			<span class="sep">|</span>
			<button class="theme-btn" class:active={currentTheme === 'dark'} onclick={() => (currentTheme = 'dark')}>다크</button>
			<span class="sep">|</span>
			<button class="theme-btn" class:active={currentTheme === 'system'} onclick={() => (currentTheme = 'system')}>시스템</button>
		</div>
	</div>
</footer>

<style>
		:root {
			/* Header Height for sticky elements */
			--nav-height: 4.1rem;

			/* LaTeX-centered palette */
			--latex-bg: #f4f4f4;
			--latex-surface: #f8f8f8;
			--latex-text: #111111;
			--latex-muted: #4a4a4a;
			--latex-rule: #1a1a1a;
			--latex-accent: #b22222;
			--latex-side-mark: rgba(17, 17, 17, 0.22);

			/* System aliases (legacy-safe) */
			--bg-paper: var(--latex-bg);
			--bg-primary: var(--latex-bg);
			--bg-secondary: var(--latex-surface);
			--text-primary: var(--latex-text);
			--text-secondary: var(--latex-muted);
			--border-color: color-mix(in srgb, var(--latex-rule) 38%, transparent);
			--btn-secondary: var(--latex-surface);
			--brand-gradient: linear-gradient(
				90deg,
				color-mix(in srgb, var(--latex-text) 92%, black) 0%,
				color-mix(in srgb, var(--latex-muted) 88%, black) 100%
			);

			/* Semantic colors */
			--color-success-text: #1f6d3b;
			--color-success-bg: #e8f5ea;
			--color-danger-text: #8a1d1d;
			--color-danger-bg: #fceceb;
			--color-warning-text: #9a6900;

			/* Remove default soft shadow language */
			--shadow: none;

			/* Typography */
			--font-body: "Noto Serif KR", "STIX Two Text", "Noto Sans KR", "Times New Roman", serif;
			--font-display: "Noto Serif KR", "STIX Two Text", "Noto Sans KR", "Times New Roman", serif;
			--font-math: "STIX Two Math", "STIX Two Text", "Cambria Math", serif;
			--font-mono: "JetBrains Mono", "Noto Sans KR", "Courier Prime", monospace;
		}
	
		:global(.dark) {
			--latex-bg: #121212;
			--latex-surface: #161616;
			--latex-text: #e8e8e8;
			--latex-muted: #b7b7b7;
			--latex-rule: #d0d0d0;
			--latex-accent: #ff7b7b;
			--latex-side-mark: rgba(232, 232, 232, 0.22);

			--border-color: color-mix(in srgb, var(--latex-rule) 34%, transparent);
			--btn-secondary: var(--latex-surface);
			--brand-gradient: linear-gradient(
				90deg,
				color-mix(in srgb, var(--latex-text) 96%, white) 0%,
				color-mix(in srgb, var(--latex-muted) 95%, white) 100%
			);
			--color-success-text: #90d6a8;
			--color-success-bg: #153021;
			--color-danger-text: #f5abab;
			--color-danger-bg: #401616;
			--color-warning-text: #f5d483;
		}
		:global(*) {
			box-sizing: border-box;
		}

			:global(html) {
				background: var(--bg-primary);
				background-image: none;
				height: 100%;
				margin: 0;
				padding: 0;
			}

		:global(html.dark) {
			background-image: none;
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

				:global(html.mobile-menu-open),
				:global(body.mobile-menu-open) {
					overflow: hidden;
					overscroll-behavior: none;
				}

				:global(body.mobile-menu-open) {
					padding-right: var(--mobile-menu-scrollbar-comp, 0px);
				}

			:global(::selection) {
				background: #d4d0c8;
				color: #262422;
			}

			:global(.dark ::selection) {
				background: #5f5a52;
				color: #ece7de;
			}

		:global(a),
		:global(button),
		:global(input),
		:global(select),
		:global(textarea) {
			border-radius: 0;
		}

		:global(input),
		:global(select),
		:global(textarea) {
			background: var(--bg-primary);
			border: 1px solid var(--border-color);
			color: var(--text-primary);
			font-family: var(--font-body);
		}

		:global(button),
		:global(.btn) {
			font-family: var(--font-mono);
		}

			:global(a:focus-visible),
			:global(button:focus-visible),
			:global(input:focus-visible),
			:global(select:focus-visible),
			:global(textarea:focus-visible) {
				outline: 2px solid var(--latex-accent);
				outline-offset: 2px;
			}

			:global(.paper-document) {
				width: min(100%, 70rem);
				margin: 1.2rem auto;
				padding: 0.95rem 1rem 1.2rem;
				border-top: 2px solid var(--text-primary);
				border-bottom: 1px solid var(--border-color);
				background: var(--bg-secondary);
			}

			:global(.paper-document-header) {
				margin-bottom: 0.92rem;
				padding-bottom: 0.6rem;
				border-bottom: 1px solid var(--border-color);
			}

			:global(.paper-document-title) {
				margin: 0;
				font-family: var(--font-display);
				font-size: clamp(1.2rem, 2.4vw, 1.55rem);
				font-style: italic;
				font-weight: 560;
			}

			:global(.paper-document-subtitle) {
				margin: 0.22rem 0 0;
				color: var(--text-secondary);
				font-size: 0.8rem;
				font-family: var(--font-mono);
				text-transform: uppercase;
				letter-spacing: 0.08em;
			}

			:global(.paper-sections) {
				list-style: none;
				padding: 0;
				margin: 0;
				counter-reset: paper-section;
				display: grid;
				gap: 0.9rem;
			}

			:global(.paper-section) {
				padding-top: 0.7rem;
				border-top: 1px solid var(--border-color);
				counter-increment: paper-section;
			}

			:global(.paper-section-title) {
				margin: 0 0 0.38rem;
				font-family: var(--font-display);
				font-size: 1.03rem;
				font-style: italic;
				font-weight: 550;
				display: flex;
				gap: 0.42rem;
				align-items: baseline;
			}

			:global(.paper-section-title::before) {
				content: counter(paper-section) ".";
				font-family: var(--font-mono);
				font-size: 0.74rem;
				letter-spacing: 0.08em;
				color: var(--text-secondary);
			}

			:global(.paper-level-1),
			:global(.paper-level-2),
			:global(.paper-level-3) {
				margin: 0;
				font-family: var(--font-display);
				font-style: italic;
				font-weight: 560;
				line-height: 1.35;
			}

			:global(.paper-level-1) {
				font-size: clamp(1.2rem, 2.3vw, 1.48rem);
			}

			:global(.paper-level-2) {
				font-size: clamp(1.02rem, 1.9vw, 1.2rem);
			}

			:global(.paper-level-3) {
				font-size: 0.98rem;
			}

			:global(.paper-level-1::before),
			:global(.paper-level-2::before),
			:global(.paper-level-3::before) {
				display: inline-block;
				margin-right: 0.45rem;
				font-family: var(--font-mono);
				font-size: 0.68em;
				letter-spacing: 0.08em;
				font-style: normal;
				color: var(--text-secondary);
			}

			:global(.paper-level-1::before) {
				content: attr(data-number);
			}

			:global(.paper-level-2::before) {
				content: attr(data-number);
			}

			:global(.paper-level-3::before) {
				content: attr(data-number);
			}

			:global(.paper-fieldset) {
				margin: 0;
				padding: 0;
				border: none;
				display: grid;
				gap: 0.62rem;
			}

			:global(.paper-field) {
				display: grid;
				gap: 0.26rem;
			}

			:global(.paper-label) {
				font-family: var(--font-mono);
				font-size: 0.64rem;
				letter-spacing: 0.1em;
				text-transform: uppercase;
				font-weight: 650;
				color: var(--text-secondary);
			}

			:global(.paper-form-note) {
				margin: 0;
				font-size: 0.84rem;
				color: var(--text-secondary);
				line-height: 1.55;
			}

			:global(.paper-actions) {
				margin-top: 0.8rem;
				padding-top: 0.62rem;
				border-top: 1px solid var(--border-color);
				display: flex;
				flex-wrap: wrap;
				gap: 0.44rem;
				justify-content: flex-end;
			}

			:global(.paper-btn) {
				border: 1px solid var(--text-primary);
				background: transparent;
				color: var(--text-primary);
				padding: 0.56rem 0.84rem;
				font-size: 0.67rem;
				font-weight: 640;
				letter-spacing: 0.08em;
				text-transform: uppercase;
				text-decoration: none;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				cursor: pointer;
				font-family: var(--font-mono);
			}

			:global(.paper-btn.primary) {
				background: var(--text-primary);
				color: var(--bg-primary);
			}

			:global(.paper-btn.primary:hover:not(:disabled)) {
				background: transparent;
				color: var(--text-primary);
			}

			:global(.paper-btn.secondary) {
				border-color: var(--border-color);
				color: var(--text-secondary);
			}

			:global(.paper-btn.secondary:hover:not(:disabled)) {
				border-color: var(--text-primary);
				color: var(--text-primary);
			}

			:global(.paper-status-note) {
				margin: 0;
				padding: 0.55rem 0.62rem;
				border: 1px solid var(--border-color);
				font-size: 0.84rem;
				line-height: 1.5;
			}

			:global(.paper-status-note.error) {
				border-color: var(--color-danger-text);
				color: var(--color-danger-text);
			}

			:global(.paper-status-note.success) {
				border-color: var(--color-success-text);
				color: var(--color-success-text);
			}

			:global(.paper-status-note.muted) {
				color: var(--text-secondary);
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
		background: var(--latex-bg);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 28%, transparent);
		padding: 0 1.5rem;
		height: var(--nav-height);
		display: flex;
		align-items: center;
		position: sticky;
		top: 0;
		z-index: 50;
		transition: border-color 0.3s, background-color 0.3s;
		box-shadow: none;
	}

	:global(.dark) .global-nav {
		background: var(--latex-bg);
		border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 36%, transparent);
	}

	.global-nav.guest-latex {
		background: var(--latex-bg);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 28%, transparent);
		box-shadow: none;
	}

	:global(.dark) .global-nav.guest-latex {
		border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 36%, transparent);
	}

	.global-nav.guest-latex .nav-content {
		max-width: 980px;
	}

		.guest-wordmark {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 1.7rem;
			height: 1.7rem;
			text-decoration: none;
		}

	.guest-wordmark:focus-visible {
		outline: 2px solid var(--latex-accent);
		outline-offset: 4px;
	}

		.guest-logo-mark {
			width: 1.42rem;
			height: 1.42rem;
			opacity: 0.95;
			filter: grayscale(0.2) contrast(1.05);
		}

	.guest-theme-selector {
		font-size: 0.72rem;
		gap: 0.3rem;
		color: var(--latex-muted);
	}

	.paper-nav-link {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.86rem;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		text-decoration: none;
		padding: 0.15rem 0;
		border-bottom: 1px solid transparent;
		transition: border-color 0.2s, color 0.2s;
	}

	.paper-nav-link:hover {
		color: var(--text-primary);
		border-bottom-color: var(--text-primary);
	}

	.paper-nav-link:focus-visible {
		outline: 2px solid var(--latex-accent);
		outline-offset: 2px;
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
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			column-gap: 0.38rem;
			row-gap: 0.2rem;
		}

		.footer-chip {
			display: inline-flex;
			align-items: center;
			gap: 0.2rem;
		}

		.footer-sep {
			opacity: 0.55;
			color: var(--latex-muted);
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
        max-width: 980px;
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

	.nav-right {
		margin-left: auto;
	}

    .nav-actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
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

	.logout-btn:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}

    .logout-btn:hover { color: var(--color-danger-text); }

		/* Mobile Menu Toggle */
		.mobile-menu-toggle {
			background: transparent;
			border: none;
			cursor: pointer;
			padding: 0;
			width: 2.2rem;
			height: 2.2rem;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 999px;
			color: var(--text-primary);
			transition: background-color 0.22s, color 0.22s, transform 0.2s;
		}

		.mobile-menu-toggle:hover {
			background: color-mix(in srgb, var(--bg-primary) 80%, transparent);
		}

		.mobile-menu-toggle.is-open {
			background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
		}

		.mobile-menu-toggle:focus-visible {
			outline: 2px solid var(--latex-accent);
			outline-offset: 2px;
		}

		.menu-glyph {
			position: relative;
			display: block;
			width: 1.18rem;
			height: 0.88rem;
		}

		.menu-line {
			position: absolute;
			left: 0;
			width: 100%;
			height: 2px;
			background: currentColor;
			border-radius: 999px;
			transform-origin: center;
			transition:
				top 0.28s cubic-bezier(0.16, 1, 0.3, 1),
				transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
				opacity 0.2s ease;
		}

		.menu-line.line-1 { top: 0; }
		.menu-line.line-2 { top: 0.38rem; }
		.menu-line.line-3 { top: 0.76rem; }

		.mobile-menu-toggle.is-open .menu-line.line-1 {
			top: 0.38rem;
			transform: rotate(45deg);
		}

		.mobile-menu-toggle.is-open .menu-line.line-2 {
			opacity: 0;
			transform: scaleX(0.38);
		}

		.mobile-menu-toggle.is-open .menu-line.line-3 {
			top: 0.38rem;
			transform: rotate(-45deg);
		}

		/* Mobile Dropdown */
		.mobile-dropdown {
			position: absolute;
			top: var(--nav-height);
			left: 0;
			right: 0;
			background: var(--bg-secondary);
			border-bottom: 1px solid var(--border-color);
			box-shadow: none;
			z-index: 40;
			padding: 0.8rem 1rem 0.92rem;
		}

		.mobile-dropdown-content {
			width: min(100%, 34rem);
			margin: 0 auto;
			display: grid;
			gap: 0.64rem;
		}

		.mobile-group {
			display: grid;
			gap: 0.16rem;
			padding: 0.08rem 0;
			border: none;
			background: transparent;
		}

		.group-label {
			font-family: var(--font-display);
			font-style: italic;
			font-size: 0.7rem;
			color: var(--text-secondary);
			text-transform: uppercase;
			letter-spacing: 0.08em;
			border: none;
			padding-bottom: 0;
			margin: 0.12rem 0 0.16rem;
		}

		.mobile-link {
			color: var(--text-primary);
			text-decoration: none;
			font-family: var(--font-body);
			font-size: 1.01rem;
			line-height: 1.35;
			display: flex;
			align-items: center;
			width: 100%;
			max-width: 100%;
			min-height: 2.42rem;
			padding: 0.54rem 0.08rem;
			border: none;
			border-bottom: 1px solid color-mix(in srgb, var(--border-color) 68%, transparent);
			background: transparent;
			transform-origin: left center;
			animation: mobile-menu-item-expand 0.34s cubic-bezier(0.16, 1, 0.3, 1) both;
			transition: color 0.2s, border-color 0.2s, background-color 0.2s;
			clip-path: inset(0);
		}

		.mobile-link:hover {
			color: var(--text-primary);
			border-bottom-color: var(--text-primary);
			background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
		}

		.mobile-link:focus-visible {
			outline: 2px solid var(--latex-accent);
			outline-offset: 2px;
		}

		.mobile-logout-btn {
			background: transparent;
			border: none;
			border-bottom: 1px solid color-mix(in srgb, var(--border-color) 68%, transparent);
			color: var(--text-secondary);
			font-family: var(--font-mono);
			font-size: 0.68rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			width: 100%;
			max-width: 100%;
			min-height: 2.35rem;
			display: flex;
			align-items: center;
			justify-content: flex-start;
			padding: 0.5rem 0.08rem;
			text-align: left;
			transform-origin: left center;
			animation: mobile-menu-item-expand 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.03s both;
			transition: border-color 0.2s, background-color 0.2s, color 0.2s;
			clip-path: inset(0);
		}

		.mobile-logout-btn:hover {
			border-bottom-color: var(--color-danger-text);
			color: var(--color-danger-text);
			background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
		}

		.mobile-logout-btn:focus-visible {
			outline: 2px solid var(--latex-accent);
			outline-offset: 2px;
		}

		.mobile-group > :is(.mobile-link, .mobile-logout-btn) {
			width: 100%;
		}

		.mobile-group > :is(.mobile-link, .mobile-logout-btn):last-child {
			border-bottom-color: transparent;
		}

    /* Utilities */
    .desktop-only { display: flex; }
    .mobile-only { display: none; }

		@media (max-width: 768px) {
			.desktop-only { display: none !important; }
			.mobile-only { display: block !important; }
			.mobile-menu-toggle.mobile-only { display: flex !important; }
			.mobile-dropdown.mobile-only { display: block !important; }

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
			align-items: center;
			gap: 0.55rem;
		}

		footer.guest-latex-footer .footer-info {
			text-align: center;
		}

		footer.guest-latex-footer .theme-selector {
			align-self: center;
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
				width: 1.4rem;
				height: 1.4rem;
			}

			.guest-logo-mark {
				width: 1.2rem;
				height: 1.2rem;
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
			justify-content: center;
			flex-wrap: wrap;
			font-size: 0.66rem;
		}

		footer.guest-latex-footer .theme-btn {
			padding: 0.22rem 0.34rem;
			min-height: 1.75rem;
		}

		footer.guest-latex-footer .footer-sep {
			display: none;
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

	footer.guest-latex-footer .theme-btn:focus-visible {
		outline: 2px solid var(--latex-accent);
		outline-offset: 2px;
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
			margin-left: 0;
		}

	.social-link:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 3px;
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

	.theme-btn:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
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

		@keyframes mobile-menu-item-expand {
			from {
				opacity: 0;
				clip-path: inset(0 100% 0 0);
			}

			to {
				opacity: 1;
				clip-path: inset(0 0 0 0);
			}
		}

	</style>
