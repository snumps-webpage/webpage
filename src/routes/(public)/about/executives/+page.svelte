<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>역대 회장단 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>역대 회장단</h1>
	{#if data.terms.length === 0}<p>데이터 이주 후 표시됩니다.</p>{/if}
	{#each data.terms as t (t.term)}
		<h2>{t.term}</h2>
		<ul>
			{#each t.holders as h (h.title + h.name)}
				<li>{h.title} — {h.name}{#if h.contact}&nbsp;({h.contact}){/if}</li>
			{/each}
		</ul>
	{/each}
</section>

<style>
	.doc-page { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
</style>
