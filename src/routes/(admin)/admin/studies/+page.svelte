<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>스터디 관리 — SNUMPS Admin</title></svelte:head>

<section class="admin-editor">
	<h1>스터디 관리</h1>

	<form method="POST" action="?/create" use:enhance>
		<h2>새 스터디</h2>
		<label>분야명 <input name="title" required /></label>
		<label>학기 (YY-1|2) <input name="semester" required /></label>
		<label>교재 <input name="textbook" /></label>
		<label>설명 <textarea name="description" rows="2"></textarea></label>
		<label>주최자
			<select name="organizerId" required>
				{#each data.members as m (m.id)}<option value={m.id}>{m.name} ({m.department})</option>{/each}
			</select>
		</label>
		<button>생성</button>
	</form>

	{#each data.studies as s (s.id)}
		<article>
			<h3>{s.title} <small>{s.semester} · {s.status} · 참여 {s.participantIds.length}명</small></h3>
			<form method="POST" action="?/update" use:enhance>
				<input type="hidden" name="id" value={s.id} />
				<label>분야명 <input name="title" value={s.title} /></label>
				<label>교재 <input name="textbook" value={s.textbook} /></label>
				<label>상태
					<select name="status">
						{#each ['recruiting', 'ongoing', 'finished'] as st (st)}
							<option value={st} selected={st === s.status}>{st}</option>
						{/each}
					</select>
				</label>
				<button>수정</button>
			</form>
			<form method="POST" action="?/setOrganizer" use:enhance>
				<input type="hidden" name="id" value={s.id} />
				<label>주최자 직권 변경 (진행 중 전달 제안은 해제됨)
					<select name="organizerId">
						{#each data.members as m (m.id)}
							<option value={m.id} selected={s.organizerIds.includes(m.id)}>{m.name}</option>
						{/each}
					</select>
				</label>
				<button>변경</button>
			</form>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={s.id} />
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
