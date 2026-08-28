<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.study);
</script>

<svelte:head><title>{s.title} — SNUMPS 스터디</title></svelte:head>

<section class="study-detail">
	<h1>{s.title} <small>{s.semester} · {s.status}</small></h1>
	{#if s.textbook}<p>교재: {s.textbook}</p>{/if}
	{#if s.description}<p>{s.description}</p>{/if}
	<p>주최: {s.organizerNames.join(', ')} · 참여 {s.participantNames.length}명</p>

	{#if s.isOrganizer}
		<p><a href="/study/{s.id}/manage">인원·회차 관리</a> · <a href="/study/{s.id}/attendance">출결 관리</a></p>
	{:else if s.isParticipant}
		<form method="POST" action="?/leave" use:enhance><button>참여 취소</button></form>
	{:else if s.isPending}
		<p>참여 신청 수락 대기 중</p>
		<form method="POST" action="?/leave" use:enhance><button>신청 철회</button></form>
	{:else if s.status === 'recruiting'}
		<form method="POST" action="?/join" use:enhance><button>참여 신청</button></form>
	{:else}
		<p>모집 중이 아닙니다.</p>
	{/if}

	{#if data.sessions.length > 0}
		<h2>회차</h2>
		<ul>
			{#each data.sessions as sess (sess.sessionNo)}
				<li>{sess.sessionNo}회차 — {new Date(sess.date).toLocaleString('ko-KR')} ({sess.status})</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.study-detail { max-width: 32rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
	button { align-self: flex-start; padding: 0.35rem 1rem; cursor: pointer; }
</style>
