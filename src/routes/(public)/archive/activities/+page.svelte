<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>활동 기록 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>활동 기록</h1>
	{#if data.activities.length === 0}<p>데이터 이주 후 표시됩니다.</p>{/if}
	<ul>
		{#each data.activities as a (a.title + a.date.start)}
			<li>{new Date(a.date.start).toLocaleDateString('ko-KR')} — [{a.type}] {a.title}</li>
		{/each}
	</ul>
</section>

<style>
	.doc-page { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
</style>
