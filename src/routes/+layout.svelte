<script lang="ts">
  import "$lib/manuscript.css";
  import favicon from "$lib/assets/favicon.svg";
  import instagram from "$lib/assets/instagram.svg";
  import { browser } from "$app/environment";
  import { page, navigating } from "$app/state";
  import { onNavigate, afterNavigate } from "$app/navigation";
  import {
    memberNavigation,
    navigationCurrent,
  } from "$lib/domain/member-navigation";
  import { signOut } from "@auth/sveltekit/client";
  import { getInitialTheme, applyTheme, type Theme } from "$lib/theme";
  import ExecutiveContacts from "$lib/components/ExecutiveContacts.svelte";
  import Toasts from "$lib/components/Toasts.svelte";
  import { toExecutiveRoster } from "$lib/domain/executive-roster";

  let { children } = $props();
  const session = $derived(page.data.session);
  const isWithdrawn = $derived(page.data.memberStatus === "withdrawn");
  const navigation = $derived(
    memberNavigation({
      hasSession: !!session?.user,
      isMember: page.data.isMember === true,
      isAdmin: page.data.isAdmin === true,
      isWithdrawn,
      canViewMemberZone: page.data.canViewMemberZone === true,
      canParticipate: page.data.canParticipate === true,
      canManageSelf: page.data.canManageSelf === true,
      hasPresenterEvents: page.data.hasPresenterEvents === true,
    }),
  );
  const isGuestLanding = $derived(!session?.user && page.url.pathname === "/");

  // Theme state
  let currentTheme = $state<Theme>(getInitialTheme());
  let isMobileMenuOpen = $state(false);
  let menuToggle = $state<HTMLButtonElement>();

  $effect(() => {
    applyTheme(currentTheme);
  });

  $effect(() => {
    if (!browser) return;
    document.documentElement.classList.toggle("guest-landing", isGuestLanding);
    return () => document.documentElement.classList.remove("guest-landing");
  });

  $effect(() => {
    if (!browser) return;
    const root = document.documentElement;
    const body = document.body;
    const syncScrollbarComp = () => {
      if (
        window.innerWidth > 900 ||
        (isGuestLanding && window.innerWidth > 768)
      ) {
        isMobileMenuOpen = false;
        return;
      }
      const scrollbarComp = Math.max(0, window.innerWidth - body.offsetWidth);
      body.style.setProperty(
        "--mobile-menu-scrollbar-comp",
        `${scrollbarComp}px`,
      );
    };

    if (!isMobileMenuOpen) {
      root.classList.remove("mobile-menu-open");
      body.classList.remove("mobile-menu-open");
      body.style.setProperty("--mobile-menu-scrollbar-comp", "0px");
      return;
    }

    syncScrollbarComp();
    root.classList.add("mobile-menu-open");
    body.classList.add("mobile-menu-open");
    window.addEventListener("resize", syncScrollbarComp);
    return () => {
      window.removeEventListener("resize", syncScrollbarComp);
      root.classList.remove("mobile-menu-open");
      body.classList.remove("mobile-menu-open");
      body.style.setProperty("--mobile-menu-scrollbar-comp", "0px");
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

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && isMobileMenuOpen) {
      event.preventDefault();
      isMobileMenuOpen = false;
      menuToggle?.focus();
    }
  }}
/>

<svelte:head>
  <link rel="icon" href={favicon} />
  <script>
    // Inline script to prevent theme flicker on page load
    (function () {
      try {
        const theme = localStorage.getItem("theme") || "system";
        const isDark =
          theme === "dark" ||
          (theme === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) document.documentElement.classList.add("dark");
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
        <img
          src={favicon}
          alt=""
          aria-hidden="true"
          class="guest-logo-mark"
        />{#if !isGuestLanding}<span class="brand-name">SNUMPS</span>{/if}
      </a>
      {#if isGuestLanding}
        <a href="/about" class="paper-nav-link desktop-only">About</a>
        <a href="/archive" class="paper-nav-link desktop-only">Archive</a>
        <a href="/members" class="paper-nav-link desktop-only">Members</a>
      {:else}
        {#each [...navigation.publicLinks, ...navigation.memberLinks].filter((link) => link.desktop !== false) as link (link.href)}
          <a
            href={link.href}
            class="paper-nav-link desktop-only"
            aria-current={navigationCurrent(
              link.href,
              page.url.pathname,
              [
                ...navigation.publicLinks,
                ...navigation.memberLinks,
                ...navigation.adminLinks,
              ].filter((candidate) => candidate.desktop !== false),
            )
              ? "page"
              : undefined}>{link.label}</a
          >
        {/each}
      {/if}
    </div>
    <div class="nav-right">
      {#if session?.user}
        <div class="desktop-only nav-actions">
          {#each navigation.adminLinks.filter((link) => link.desktop !== false) as link (link.href)}
            <a
              href={link.href}
              class="paper-nav-link"
              aria-current={navigationCurrent(
                link.href,
                page.url.pathname,
                [
                  ...navigation.publicLinks,
                  ...navigation.memberLinks,
                  ...navigation.adminLinks,
                ].filter((candidate) => candidate.desktop !== false),
              )
                ? "page"
                : undefined}>{link.label}</a
            >
          {/each}
          <button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
        </div>
      {:else if !isGuestLanding}<a
          href="/login"
          class="paper-nav-link desktop-only">로그인</a
        >{/if}
      <button
        class="mobile-menu-toggle mobile-only"
        bind:this={menuToggle}
        class:is-open={isMobileMenuOpen}
        onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
        aria-controls="mobile-nav-menu"
        aria-expanded={isMobileMenuOpen}
        aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
      >
        <span class="menu-glyph" aria-hidden="true">
          <span class="menu-line line-1"></span>
          <span class="menu-line line-2"></span>
          <span class="menu-line line-3"></span>
        </span>
      </button>
    </div>
  </div>

  <div
    id="mobile-nav-menu"
    class="mobile-dropdown mobile-only stagger-1"
    hidden={!isMobileMenuOpen}
  >
    <div class="mobile-dropdown-content">
      {#if navigation.memberLinks.length}
        <div class="mobile-group">
          <span class="group-label">내 작업</span>
          {#each navigation.memberLinks as link (link.href)}<a
              href={link.href}
              class="mobile-link"
              aria-current={navigationCurrent(
                link.href,
                page.url.pathname,
                navigation.memberLinks,
              )
                ? "page"
                : undefined}>{link.label}</a
            >{/each}
        </div>
      {/if}
      <div class="mobile-group">
        <span class="group-label"
          >{isGuestLanding ? "Public" : "동아리 둘러보기"}</span
        >
        {#each navigation.publicLinks as link (link.href)}<a
            href={link.href}
            class="mobile-link"
            aria-current={navigationCurrent(
              link.href,
              page.url.pathname,
              navigation.publicLinks,
            )
              ? "page"
              : undefined}
            >{isGuestLanding && link.href === "/archive"
              ? "활동 아카이브"
              : link.label}</a
          >{/each}
      </div>
      {#if navigation.adminLinks.length}
        <div class="mobile-group">
          <span class="group-label">운영진</span>
          {#each navigation.adminLinks as link (link.href)}<a
              href={link.href}
              class="mobile-link"
              aria-current={navigationCurrent(
                link.href,
                page.url.pathname,
                navigation.adminLinks,
              )
                ? "page"
                : undefined}>{link.label}</a
            >{/each}
        </div>
      {/if}
      {#if session?.user || !isGuestLanding}
        <div class="mobile-group">
          {#if session?.user}<button
              class="mobile-logout-btn"
              onclick={() => signOut()}>로그아웃</button
            >{:else if !isGuestLanding}<a href="/login" class="mobile-link"
              >로그인</a
            >{/if}
        </div>
      {/if}
    </div>
  </div>
</nav>

<main class:guest-latex-main={isGuestLanding}>
  {@render children()}
</main>

<Toasts />

<footer class="guest-latex-footer unified-footer">
  <div class="footer-content">
    <div class="footer-info">
      <div class="footer-line">
        {#await page.data.executives then executiveTerms}
          <ExecutiveContacts
            roster={toExecutiveRoster(executiveTerms)}
            variant="footer"
          />
        {/await}
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
      <button
        class="theme-btn"
        class:active={currentTheme === "light"}
        onclick={() => (currentTheme = "light")}>라이트</button
      >
      <span class="sep">|</span>
      <button
        class="theme-btn"
        class:active={currentTheme === "dark"}
        onclick={() => (currentTheme = "dark")}>다크</button
      >
      <span class="sep">|</span>
      <button
        class="theme-btn"
        class:active={currentTheme === "system"}
        onclick={() => (currentTheme = "system")}>시스템</button
      >
    </div>
  </div>
</footer>

<style>
  .guest-wordmark {
    width: auto;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .guest-logo-mark {
    width: 24px;
    height: 24px;
  }
  .nav-left,
  .nav-right {
    gap: 0.7rem;
  }
  .paper-nav-link {
    min-height: 44px;
    line-height: 44px;
    white-space: nowrap;
  }
  .brand-name {
    font: 600 1.15rem/1 var(--font-display);
    color: var(--latex-text);
  }
  .paper-nav-link {
    font-family: var(--font-ui);
    font-style: normal;
    font-size: 0.8rem;
    letter-spacing: 0;
  }
  .paper-nav-link[aria-current="page"],
  .mobile-link[aria-current="page"] {
    text-decoration: underline;
    text-underline-offset: 0.3em;
  }
  .mobile-dropdown.mobile-only[hidden] {
    /* Override the global mobile-only utility's important display rule. */
    display: none !important;
  }
  .group-label {
    font-family: var(--font-ui);
  }
  .mobile-link {
    font-family: var(--font-ui);
  }
  @media (max-width: 900px) {
    .desktop-only {
      display: none;
    }
    .mobile-only {
      display: inline-flex;
    }
    .mobile-dropdown.mobile-only {
      display: block;
    }
    .mobile-dropdown.mobile-only[hidden] {
      display: none !important;
    }
  }

  /* The anonymous homepage keeps its original visual identity. */
  .global-nav.guest-latex .guest-wordmark {
    width: 1.7rem;
    height: 1.7rem;
    gap: 0;
  }
  .global-nav.guest-latex .guest-logo-mark {
    width: 1.42rem;
    height: 1.42rem;
  }
  .global-nav.guest-latex .nav-left,
  .global-nav.guest-latex .nav-right {
    gap: 1rem;
  }
  .global-nav.guest-latex .paper-nav-link {
    min-height: initial;
    line-height: normal;
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.86rem;
    letter-spacing: 0.02em;
  }
  .global-nav.guest-latex .group-label {
    font-family: var(--font-display);
  }
  .global-nav.guest-latex .mobile-link {
    font-family: var(--font-body);
  }
  @media (min-width: 769px) and (max-width: 900px) {
    .global-nav.guest-latex .desktop-only {
      display: flex;
    }
    .global-nav.guest-latex .mobile-only {
      display: none;
    }
  }
</style>
