<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function copyLink(path: string) {
		await navigator.clipboard.writeText(`${location.origin}${path}`);
	}
</script>

<svelte:head><title>세미나 출석 관리 — SNUMPS</title></svelte:head>

<section class="manage-page">
	<h1>세미나 출석 관리</h1>
	{#if data.managedSeminars.length === 0}
		<p>관리할 세미나가 없습니다. 발표자로 등록된 세미나가 여기에 표시됩니다.</p>
	{:else}
		{#each data.managedSeminars as s (s.id)}
			<article>
				<h2>{s.title} <small>{new Date(s.date).toLocaleString('ko-KR')} · {s.status}</small></h2>
				<p>
					출석 링크: <code>{s.attendPath}</code>
					<button type="button" onclick={() => copyLink(s.attendPath)}>복사</button>
					— 참석자에게 공유하면 접속해 직접 출석할 수 있습니다.
				</p>
				{#if s.applicants.length === 0}
					<p>아직 참가 신청자가 없습니다.</p>
				{:else}
					<form method="POST" action="?/saveAttendance" use:enhance>
						<input type="hidden" name="eventId" value={s.id} />
						<ul>
							{#each s.applicants as a (a.id)}
								<li>
									<label>
										<input type="checkbox" name="attendeeIds" value={a.id} checked={a.checked} />
										{a.name} ({a.department})
									</label>
								</li>
							{/each}
						</ul>
						<button type="submit">출석 저장</button>
						<p class="note">체크인 링크로 직접 출석한 인원은 이 저장으로 지워지지 않습니다.</p>
					</form>
				{/if}
			</article>
		{/each}
	{/if}
</section>

<style>
	.manage-page { max-width: 36rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1.2rem; }
	article { border: 1px solid #8886; padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
	ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
	button { padding: 0.3rem 0.9rem; cursor: pointer; align-self: flex-start; }
	.note { font-size: 0.85rem; opacity: 0.7; margin: 0; }
</style>
