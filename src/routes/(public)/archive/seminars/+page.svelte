<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const terms = $derived([...new Set(data.seminars.map((s) => s.semester))]);
</script>

<svelte:head><title>세미나 기록 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>세미나 기록</h1>
	{#if data.seminars.length === 0}<p>데이터 이주 후 표시됩니다.</p>{/if}
	{#each terms as term (term)}
		<h2>{term}</h2>
		<ul>
			{#each data.seminars.filter((s) => s.semester === term) as s (s.id)}
				<li>
					<a href="/archive/seminars/{s.id}">{s.title}</a>
					— {[...s.presenters, s.externalPresenters].filter(Boolean).join(', ')}
					{#if s.materialCount}· 자료 {s.materialCount}{/if}
				</li>
			{/each}
		</ul>
	{/each}
</section>

<style>
	.doc-page { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
</style>
