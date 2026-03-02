/**
 * Shared reactive state controllers using Svelte 5 Runes.
 */

/**
 * Creates a pagination controller for a given items getter.
 */
export function createPagination<T>(itemsGetter: () => T[], pageSize = 10) {
	let page = $state(1);

	const totalItems = $derived(itemsGetter().length);
	const totalPages = $derived(Math.max(1, Math.ceil(totalItems / pageSize)));
	const pageNumbers = $derived(Array.from({ length: totalPages }, (_, i) => i + 1));

	const items = $derived(
		itemsGetter().slice((page - 1) * pageSize, page * pageSize)
	);

	function goTo(p: number) {
		if (p >= 1 && p <= totalPages) {
			page = p;
		}
	}

	function next() {
		goTo(page + 1);
	}

	function prev() {
		goTo(page - 1);
	}

	function reset() {
		page = 1;
	}

	return {
		get page() { return page; },
		get totalPages() { return totalPages; },
		get pageNumbers() { return pageNumbers; },
		get items() { return items; },
		goTo,
		next,
		prev,
		reset
	};
}
