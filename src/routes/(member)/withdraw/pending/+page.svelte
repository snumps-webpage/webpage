<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');
</script>

<svelte:head><title>탈퇴 처리 중 — SNUMPS</title></svelte:head>

<section class="pending-page">
	<h1>탈퇴 처리 중</h1>
	<p>{data.memberName}님의 탈퇴 신청이 접수되어 있습니다.</p>
	<ul>
		<li>신청일: {fmt(data.state.requestedAt)}</li>
		<li>개인정보 삭제 예정일: {fmt(data.state.deleteAfter)}</li>
		{#if data.state.held}<li>회장단이 정보 보존을 집행한 상태입니다.</li>{/if}
	</ul>
	<p>유예 기간 중에는 회원 기능을 이용할 수 없습니다. 마음이 바뀌셨다면 아래 버튼으로 철회할 수 있습니다.</p>
	<form method="POST" action="?/cancelWithdrawal" use:enhance>
		<button>탈퇴 철회</button>
	</form>
</section>

<style>
	.pending-page { max-width: 28rem; margin: 3rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
	button { align-self: flex-start; padding: 0.4rem 1.2rem; cursor: pointer; }
</style>
