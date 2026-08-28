<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.seminar);
</script>

<svelte:head><title>{s.title} — SNUMPS 세미나</title></svelte:head>

<section class="doc-page">
	<h1>{s.title} <small>{s.semester}</small></h1>
	<p>발표: {[...s.presenters, s.externalPresenters].filter(Boolean).join(', ')}</p>
	{#if s.note}<p>{s.note}</p>{/if}
	{#if s.materials.length}
		<h2>강의 자료</h2>
		<ul>{#each s.materials as url (url)}<li><a href={url}>{url.split('/').pop()}</a></li>{/each}</ul>
	{/if}
	{#if s.photos.length}
		<h2>활동 사진</h2>
		<div class="grid">
			{#each s.photos as url (url)}<img src={url} alt="{s.title} 활동 사진" loading="lazy" />{/each}
		</div>
	{/if}
	<p><a href="/archive/seminars">← 목록</a></p>
</section>

<style>
	.doc-page { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.5rem; }
	img { max-width: 100%; height: auto; }
</style>
