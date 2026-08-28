<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>회원 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>회원</h1>
	{#if data.members.length === 0}<p>데이터 이주 후 표시됩니다.</p>{/if}
	<table>
		<thead><tr><th>이름</th><th>학과</th><th>가입</th><th>임원 이력</th></tr></thead>
		<tbody>
			{#each data.members as m (m.name + m.joinedAt)}
				<tr>
					<td>{m.name}</td>
					<td>{m.department}</td>
					<td>{m.joinedAt ?? '—'}</td>
					<td>{m.roles.map((r) => `${r.term} ${r.title}`).join(', ')}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	.doc-page { max-width: 44rem; margin: 3rem auto; padding: 0 1rem; }
	table { width: 100%; border-collapse: collapse; }
	th, td { border-bottom: 1px solid #8884; padding: 0.35rem 0.5rem; text-align: left; }
</style>
