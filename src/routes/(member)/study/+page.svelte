<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const stateLabel = {
		organizer: '주최 중',
		participant: '참여 중',
		pending: '수락 대기',
		none: ''
	} as const;
</script>

<svelte:head><title>스터디 — SNUMPS</title></svelte:head>

<section class="study-list">
	<h1>스터디</h1>
	<p><a href="/study/apply">+ 스터디 개설 신청</a></p>
	{#if data.studies.length === 0}
		<p>등록된 스터디가 없습니다.</p>
	{/if}
	{#each data.studies as s (s.id)}
		<article>
			<h2><a href="/study/{s.id}">{s.title}</a>
				<small>{s.semester} · {s.status} · {s.participantCount}명
					{#if s.myState !== 'none'}· <strong>{stateLabel[s.myState]}</strong>{/if}
				</small>
			</h2>
			{#if s.textbook}<p>교재: {s.textbook}</p>{/if}
			{#if s.description}<p>{s.description}</p>{/if}
			{#if s.myState === 'organizer'}
				<p><a href="/study/{s.id}/manage">인원·회차 관리</a> · <a href="/study/{s.id}/attendance">출결 관리</a></p>
			{/if}
		</article>
	{/each}
</section>

<style>
	.study-list { max-width: 36rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1rem; }
	article { border: 1px solid #8886; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.3rem; }
</style>
