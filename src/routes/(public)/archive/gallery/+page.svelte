<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>갤러리 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>갤러리</h1>
	{#if data.photos.length === 0}<p>자산 이주 후 표시됩니다.</p>{/if}
	<div class="grid">
		{#each data.photos as p (p.url)}
			<figure>
				<img src={p.url} alt="{p.kind} — {p.title}" loading="lazy" />
				<figcaption>[{p.kind}] {p.title}</figcaption>
			</figure>
		{/each}
	</div>
</section>

<style>
	.doc-page { max-width: 52rem; margin: 3rem auto; padding: 0 1rem; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.8rem; }
	img { max-width: 100%; height: auto; }
	figure { margin: 0; }
	figcaption { font-size: 0.8rem; opacity: 0.7; }
</style>
