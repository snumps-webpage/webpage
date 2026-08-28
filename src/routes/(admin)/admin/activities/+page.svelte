<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function confirmOverwrite(e: SubmitEvent) {
		if (!confirm('출석자 명단을 통째로 덮어씁니다. 다른 경로의 출석도 대체됩니다. 계속할까요?')) {
			e.preventDefault();
		}
	}
</script>

<svelte:head><title>활동 관리 — SNUMPS Admin</title></svelte:head>

<section class="admin-editor">
	<h1>활동 관리</h1>

	<form method="POST" action="?/create" use:enhance>
		<h2>새 활동</h2>
		<label>제목 <input name="title" required /></label>
		<label>시작 <input name="start" type="datetime-local" required /></label>
		<label>종료 <input name="end" type="datetime-local" /></label>
		<label>종류
			<select name="type">
				{#each data.activityTypes as t (t)}<option value={t}>{t}</option>{/each}
			</select>
		</label>
		<button>생성</button>
	</form>

	{#each data.activities as a (a.id)}
		<article>
			<h3>{a.title} <small>{a.type} · {a.date.start} · 출석 {a.attendeeIds.length}명</small></h3>
			<form method="POST" action="?/update" use:enhance>
				<input type="hidden" name="id" value={a.id} />
				<label>제목 <input name="title" value={a.title} /></label>
				<label>종류
					<select name="type">
						{#each data.activityTypes as t (t)}<option value={t} selected={t === a.type}>{t}</option>{/each}
					</select>
				</label>
				<button>수정</button>
			</form>
			<form method="POST" action="?/setAttendees" use:enhance onsubmit={confirmOverwrite}>
				<input type="hidden" name="id" value={a.id} />
				<select name="attendeeIds" multiple size="6">
					{#each data.members as mem (mem.id)}
						<option value={mem.id} selected={a.attendeeIds.includes(mem.id)}>
							{mem.name} ({mem.department})
						</option>
					{/each}
				</select>
				<button>출석자 덮어쓰기 (관리자 전권)</button>
			</form>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={a.id} />
				<button>삭제</button>
			</form>
		</article>
	{/each}
</section>

<style>
	.admin-editor { max-width: 46rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1.2rem; }
	form { display: flex; flex-direction: column; gap: 0.4rem; border: 1px solid #8884; padding: 0.8rem; }
	article { border: 1px solid #8886; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.6rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; }
	button { align-self: flex-start; padding: 0.3rem 0.9rem; cursor: pointer; }
</style>
