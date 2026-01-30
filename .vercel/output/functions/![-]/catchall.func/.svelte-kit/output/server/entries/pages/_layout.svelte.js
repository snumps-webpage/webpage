import { w as head, x as attr_class } from "../../chunks/index2.js";
import { p as page, n as navigating } from "../../chunks/index3.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import { a as attr } from "../../chunks/attributes.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/state.svelte.js";
import { e as escape_html } from "../../chunks/escaping.js";
const favicon = "/_app/immutable/assets/favicon.BhOLQc4l.svg";
function getInitialTheme() {
  return "system";
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    const session = page.data.session;
    let currentTheme = getInitialTheme();
    head("12qhfyh", $$renderer2, ($$renderer3) => {
      $$renderer3.push(`<link rel="icon"${attr("href", favicon)} class="svelte-12qhfyh"/> <script class="svelte-12qhfyh">
		// Inline script to prevent theme flicker on page load
		(function() {
			try {
				const theme = localStorage.getItem('theme') || 'system';
				const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
				if (isDark) document.documentElement.classList.add('dark');
			} catch (e) {}
		})();
	<\/script>`);
    });
    if (navigating.to) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="loading-bar svelte-12qhfyh"><div class="loading-progress svelte-12qhfyh"></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <nav class="global-nav svelte-12qhfyh"><div class="nav-content svelte-12qhfyh"><div class="nav-left svelte-12qhfyh"><a href="/" class="logo-btn svelte-12qhfyh" aria-label="Home"><img${attr("src", favicon)} alt="SNUMPS" class="svelte-12qhfyh"/></a> `);
    if (session?.user) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="nav-menus svelte-12qhfyh"><div class="dropdown svelte-12qhfyh"><button class="nav-link svelte-12qhfyh">Seminar</button> <div class="dropdown-content svelte-12qhfyh"><a href="/seminar/apply" class="svelte-12qhfyh">세미나 개설</a></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="nav-right svelte-12qhfyh">`);
    if (session?.user) {
      $$renderer2.push("<!--[-->");
      if (page.data.isAdmin) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<a href="/admin" class="circle-btn svelte-12qhfyh">Admin</a> <a href="/notion" class="circle-btn svelte-12qhfyh">DB</a>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <button class="logout-btn svelte-12qhfyh">로그아웃</button>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div></nav> <main class="svelte-12qhfyh">`);
    children($$renderer2);
    $$renderer2.push(`<!----></main> <footer class="svelte-12qhfyh"><div class="footer-content svelte-12qhfyh"><div class="footer-info svelte-12qhfyh"><p class="svelte-12qhfyh">회장: ${escape_html(page.data.presidentName)} | <a href="mailto:snumps0@gmail.com" class="svelte-12qhfyh">snumps0@gmail.com</a> | <a href="https://instagram.com/snu_mps" target="_blank" rel="noopener noreferrer" class="social-link svelte-12qhfyh" aria-label="Instagram"><img src="/src/lib/assets/instagram.svg" alt="Instagram" class="social-icon svelte-12qhfyh"/></a></p></div> <div class="theme-selector svelte-12qhfyh"><button${attr_class("theme-btn svelte-12qhfyh", void 0, { "active": currentTheme === "light" })}>Light</button> <span class="sep svelte-12qhfyh">|</span> <button${attr_class("theme-btn svelte-12qhfyh", void 0, { "active": currentTheme === "dark" })}>Dark</button> <span class="sep svelte-12qhfyh">|</span> <button${attr_class("theme-btn svelte-12qhfyh", void 0, { "active": currentTheme === "system" })}>System</button></div></div></footer>`);
  });
}
export {
  _layout as default
};
