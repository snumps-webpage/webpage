<script lang="ts">
    import '$lib/manuscript.css';
	import favicon from '$lib/assets/favicon.svg';
	import instagram from '$lib/assets/instagram.svg';
	import { browser } from '$app/environment';
	import { page, navigating } from '$app/state';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { signOut } from '@auth/sveltekit/client';
	import { getInitialTheme, applyTheme, type Theme } from '$lib/theme';
	import ExecutiveContacts from '$lib/components/ExecutiveContacts.svelte';
	import Toasts from '$lib/components/Toasts.svelte';

	let { children } = $props();
	const session = $derived(page.data.session);
	const isWithdrawn = $derived(page.data.memberStatus === 'withdrawn');
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
			<a href="/about" class="paper-nav-link desktop-only">About</a>
			<a href="/archive" class="paper-nav-link desktop-only">Archive</a>
			<a href="/members" class="paper-nav-link desktop-only">Members</a>
			{#if session?.user && !isWithdrawn}
				<a href="/seminar/apply" class="paper-nav-link desktop-only">Seminar</a>
				<a href="/study" class="paper-nav-link desktop-only">Study</a>
				{#if page.data.hasPresenterEvents}
					<a href="/events/manage" class="paper-nav-link desktop-only">Attendance</a>
				{/if}
				<a href="/settings/notifications" class="paper-nav-link desktop-only">Settings</a>
			{/if}
		</div>
		<div class="nav-right">
				{#if session?.user}
					<div class="desktop-only nav-actions">
					{#if page.data.isAdmin && !isWithdrawn}
						<a href="/admin" class="circle-btn">Admin</a>
					{/if}
					<button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
				</div>
			{/if}
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
			</div>
		</div>

		{#if isMobileMenuOpen}
			<div id="mobile-nav-menu" class="mobile-dropdown mobile-only stagger-1">
			<div class="mobile-dropdown-content">
				<div class="mobile-group">
					<span class="group-label">Public</span>
					<a href="/about" class="mobile-link">동아리 소개</a>
					<a href="/about/executives" class="mobile-link">역대 회장단</a>
					<a href="/archive" class="mobile-link">활동 아카이브</a>
					<a href="/members" class="mobile-link">회원 명단</a>
				</div>
				{#if session?.user && !isWithdrawn}
					<div class="mobile-group">
						<span class="group-label">Member</span>
						<a href="/study" class="mobile-link">내 스터디</a>
						<a href="/seminar/apply" class="mobile-link">세미나 개설</a>
						{#if page.data.hasPresenterEvents}
							<a href="/events/manage" class="mobile-link">발표 출석 관리</a>
						{/if}
						<a href="/settings/notifications" class="mobile-link">회원 설정</a>
					</div>
					{#if page.data.isAdmin}
						<div class="mobile-group">
							<span class="group-label">Admin</span>
							<a href="/admin" class="mobile-link">관리자 대시보드</a>
							<a href="/admin/seminars" class="mobile-link">세미나 운영</a>
							<a href="/admin/activities" class="mobile-link">활동 기록</a>
							<a href="/admin/gallery" class="mobile-link">갤러리 관리</a>
						</div>
					{/if}
				{/if}
				{#if session?.user}
					<div class="mobile-group">
						<button class="mobile-logout-btn" onclick={() => signOut()}>로그아웃</button>
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

<footer class="guest-latex-footer unified-footer">
	<div class="footer-content">
		<div class="footer-info">
			<div class="footer-line">
				<ExecutiveContacts roster={page.data.executives} variant="footer" />
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
			</div>
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
	/* All global styles moved to $lib/manuscript.css */
</style>
