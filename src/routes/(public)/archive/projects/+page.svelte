<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>개인 프로젝트 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>개인 프로젝트</h1>
	{#if data.projects.length === 0}<p>등록된 프로젝트가 없습니다.</p>{/if}
	<ul>
		{#each data.projects as p (p.name + p.project.title)}
			<li>
				<strong>{p.project.title}</strong> — {p.name} ({p.department})
				{#if p.project.url}<a href={p.project.url}>링크</a>{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	.doc-page { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
</style>
