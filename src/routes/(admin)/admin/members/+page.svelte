<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let query = $state('');

	const filtered = $derived(
		data.members.filter(
			(m) =>
				!query ||
				m.name.includes(query) ||
				m.department.includes(query) ||
				m.status.includes(query)
		)
	);
</script>

<svelte:head><title>회원 관리 — SNUMPS Admin</title></svelte:head>

<section class="admin-editor">
	<h1>회원 관리</h1>
	<input type="search" placeholder="이름 / 학과 / 지위 검색" bind:value={query} />
	<table>
		<thead>
			<tr><th>이름</th><th>학과</th><th>가입일</th><th>지위</th><th>동문</th><th>관리자</th><th>직책</th></tr>
		</thead>
		<tbody>
			{#each filtered as m (m.id)}
				<tr>
					<td><a href="/admin/members/{m.id}">{m.name}</a></td>
					<td>{m.department}</td>
					<td>{m.joinedAt ?? '—'}</td>
					<td>{m.status}</td>
					<td>{m.isAlumni ? '✓' : ''}</td>
					<td>{m.isAdmin ? '✓' : ''}</td>
					<td>{m.roles.map((r) => `${r.term} ${r.title}`).join(', ')}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	.admin-editor { max-width: 64rem; margin: 2rem auto; padding: 0 1rem; }
	table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
	th, td { border-bottom: 1px solid #8884; padding: 0.4rem 0.6rem; text-align: left; }
	input[type='search'] { padding: 0.4rem; width: 16rem; }
</style>
