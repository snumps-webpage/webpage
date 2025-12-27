<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function getRowValue(row: Record<string, string>, columnName: string): string {
		return row[columnName] ?? '';
	}
</script>

<div class="container">
	<h1>Notion 데이터베이스</h1>

	{#if data.error}
		<div class="error">{data.error}</div>
	{:else if data.rows.length === 0}
		<p class="empty">데이터가 없습니다.</p>
	{:else}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						{#each data.columns as column}
							<th>{column.name}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row}
						<tr>
							{#each data.columns as column}
								<td>{getRowValue(row, column.name)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<a href="/" class="back-link">← 홈으로</a>
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	h1 {
		margin-bottom: 1.5rem;
		color: #1a1a2e;
	}

	.error {
		background: #fee2e2;
		color: #dc2626;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.empty {
		color: #666;
	}

	.table-wrapper {
		overflow-x: auto;
		border-radius: 8px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: white;
	}

	th,
	td {
		padding: 0.75rem 1rem;
		text-align: left;
		border-bottom: 1px solid #e5e7eb;
	}

	th {
		background: #f9fafb;
		font-weight: 600;
		color: #374151;
		white-space: nowrap;
	}

	tr:hover td {
		background: #f9fafb;
	}

	.back-link {
		display: inline-block;
		margin-top: 1.5rem;
		color: #667eea;
		text-decoration: none;
	}

	.back-link:hover {
		text-decoration: underline;
	}
</style>
