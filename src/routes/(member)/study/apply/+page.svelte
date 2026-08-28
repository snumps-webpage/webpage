<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>스터디 개설 신청 — SNUMPS</title></svelte:head>

<section class="study-apply">
	<h1>스터디 개설 신청</h1>
	<p>신청 후 관리자 승인을 거쳐 개설됩니다. 승인 시 신청자가 주최자가 됩니다.</p>

	<form method="POST" use:enhance>
		<label>분야명 <input name="title" required /></label>
		<label>학기 <input name="semester" value={data.defaultSemester} required /></label>
		<label>교재 <input name="textbook" /></label>
		<label>설명 <textarea name="description" rows="4"></textarea></label>
		<button>신청</button>
	</form>

	{#if data.myRequests.length > 0}
		<h2>내 신청</h2>
		<ul>
			{#each data.myRequests as r (r.id)}
				<li>
					{r.title} ({r.semester}) — {r.status}
					{#if r.status === 'pending'}
						<form method="POST" action="?/withdraw" use:enhance style="display:inline">
							<input type="hidden" name="id" value={r.id} />
							<button>철회</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.study-apply { max-width: 30rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1rem; }
	form { display: flex; flex-direction: column; gap: 0.5rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; }
	button { align-self: flex-start; padding: 0.35rem 1rem; cursor: pointer; }
</style>
