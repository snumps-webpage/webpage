/**
 * Theme management logic for Svelte 5.
 */
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark' | 'system';

export function getInitialTheme(): Theme {
	if (!browser) return 'system';
	const savedTheme = localStorage.getItem('theme') as Theme | null;
	return savedTheme || 'system';
}

export function applyTheme(theme: Theme) {
	if (!browser) return;

	const root = document.documentElement;
	const isDark = 
		theme === 'dark' || 
		(theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

	if (isDark) {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}

	if (theme !== 'system') {
		localStorage.setItem('theme', theme);
	} else {
		localStorage.removeItem('theme');
	}
}
