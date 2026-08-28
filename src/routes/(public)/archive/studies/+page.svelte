<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>스터디 기록 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>스터디 기록</h1>
	{#if data.studies.length === 0}<p>데이터 이주 후 표시됩니다.</p>{/if}
	{#each data.studies as s (s.id)}
		<article>
			<h2>{s.title} <small>{s.semester}{s.status === 'recruiting' ? ' · 모집 중' : ''}</small></h2>
			{#if s.textbook}<p>교재: {s.textbook}</p>{/if}
			{#if s.description}<p>{s.description}</p>{/if}
			<p>주최: {s.organizers.join(', ')} · 참여 {s.participantCount}명</p>
		</article>
	{/each}
</section>

<style>
	.doc-page { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1rem; }
	article { border-bottom: 1px solid #8884; padding-bottom: 0.8rem; }
</style>
