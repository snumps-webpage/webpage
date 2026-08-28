<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>회식 갤러리 관리 — SNUMPS Admin</title></svelte:head>

<section class="admin-editor">
	<h1>회식 갤러리 관리</h1>

	<form method="POST" action="?/create" use:enhance>
		<h2>새 항목</h2>
		<label>연도 <input name="year" required /></label>
		<label>연결 활동
			<select name="activityId">
				<option value="">(없음)</option>
				{#each data.activities as a (a.id)}<option value={a.id}>{a.title} ({a.date})</option>{/each}
			</select>
		</label>
		<button>생성</button>
	</form>

	{#each data.entries as g (g.id)}
		<article>
			<h3>{g.year} <small>사진 {g.photos.length}장</small></h3>
			<ul>
				{#each g.photos as key (key)}
					<li>
						<code>{key}</code>
						<form method="POST" action="?/removePhoto" use:enhance style="display:inline">
							<input type="hidden" name="id" value={g.id} />
							<input type="hidden" name="s3Key" value={key} />
							<button>제거</button>
						</form>
					</li>
				{/each}
			</ul>
			<form method="POST" action="?/addPhoto" use:enhance>
				<input type="hidden" name="id" value={g.id} />
				<label>pending 키 등록 <input name="pendingKey" placeholder="uploads/pending/…" /></label>
				<button>등록(승격)</button>
			</form>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={g.id} />
				<button>삭제</button>
			</form>
		</article>
	{/each}
</section>

<style>
	.admin-editor { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1.2rem; }
	form { display: flex; flex-direction: column; gap: 0.4rem; border: 1px solid #8884; padding: 0.8rem; }
	article { border: 1px solid #8886; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.6rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; }
	button { align-self: flex-start; padding: 0.3rem 0.9rem; cursor: pointer; }
	ul { margin: 0.2rem 0; }
</style>
