<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.studyTitle} 출결 — SNUMPS</title></svelte:head>

<section class="sheet">
	<h1>{data.studyTitle} — 출결 관리</h1>
	{#if data.sessions.length === 0}
		<p>회차가 없습니다. 관리 페이지에서 회차를 먼저 만들어 주세요.</p>
	{/if}
	{#each data.sessions as sess (sess.eventId)}
		<article>
			<h2>{sess.sessionNo}회차 <small>{new Date(sess.date).toLocaleString('ko-KR')} · {sess.status}</small></h2>
			<form method="POST" action="?/saveAttendance" use:enhance>
				<input type="hidden" name="eventId" value={sess.eventId} />
				<ul>
					{#each data.participants as p (p.id)}
						<li>
							<label>
								<input
									type="checkbox"
									name="attendeeIds"
									value={p.id}
									checked={sess.attendeeIds.includes(p.id)}
								/>
								{p.name} ({p.department})
							</label>
						</li>
					{/each}
				</ul>
				<button>저장</button>
				<p class="note">체크인 링크로 직접 출석한 인원은 저장으로 지워지지 않습니다.</p>
			</form>
		</article>
	{/each}
</section>

<style>
	.sheet { max-width: 34rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1rem; }
	article { border: 1px solid #8886; padding: 0.9rem; }
	ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
	button { padding: 0.3rem 0.9rem; cursor: pointer; }
	.note { font-size: 0.85rem; opacity: 0.7; margin: 0.3rem 0 0; }
</style>
