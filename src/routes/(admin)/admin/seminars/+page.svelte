<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>세미나 기록 관리 — SNUMPS Admin</title></svelte:head>

<section class="admin-editor">
	<h1>세미나 기록 관리</h1>

	<form method="POST" action="?/create" use:enhance>
		<h2>새 기록</h2>
		<label>제목 <input name="title" required /></label>
		<label>학기 (YY-1|2) <input name="semester" required placeholder="26-2" /></label>
		<label>발표자 id (쉼표 구분) <input name="presenterIds" /></label>
		<label>비회원 발표자 <input name="externalPresenters" /></label>
		<label>비고 <textarea name="note" rows="2"></textarea></label>
		<button>생성</button>
	</form>

	{#each data.seminars as s (s.id)}
		<article>
			<h3>{s.title} <small>{s.semester} · 자료 {s.materials.length} · 사진 {s.photos.length}</small></h3>
			<form method="POST" action="?/update" use:enhance>
				<input type="hidden" name="id" value={s.id} />
				<label>제목 <input name="title" value={s.title} /></label>
				<label>비고 <textarea name="note" rows="2">{s.note}</textarea></label>
				<button>수정</button>
			</form>
			{#each [{ field: 'materials', label: '자료' }, { field: 'photos', label: '사진' }] as f (f.field)}
				<div>
					<strong>{f.label}</strong>
					<ul>
						{#each s[f.field as 'materials' | 'photos'] as key (key)}
							<li>
								<code>{key}</code>
								<form method="POST" action="?/removeFile" use:enhance style="display:inline">
									<input type="hidden" name="id" value={s.id} />
									<input type="hidden" name="field" value={f.field} />
									<input type="hidden" name="s3Key" value={key} />
									<button>제거</button>
								</form>
							</li>
						{/each}
					</ul>
					<form method="POST" action="?/addFile" use:enhance>
						<input type="hidden" name="id" value={s.id} />
						<input type="hidden" name="field" value={f.field} />
						<label>pending 키 등록 <input name="pendingKey" placeholder="uploads/pending/…" /></label>
						<button>등록(승격)</button>
					</form>
				</div>
			{/each}
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
	ul { margin: 0.2rem 0; }
</style>
