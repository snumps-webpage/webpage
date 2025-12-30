<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let searchType = $state('이름'); // '이름' or '학과'

	function getRowValue(row: Record<string, string>, columnName: string): string {
		return row[columnName] ?? '';
	}

	let filteredRows = $derived(
		searchQuery.trim() === '' 
			? data.rows 
			: data.rows.filter((row: any) => {
				const value = row[searchType] || '';
				return value.toLowerCase().includes(searchQuery.toLowerCase());
			})
	);
</script>

<div class="container">
	<h1>Notion 데이터베이스</h1>

	{#if data.error}
		<div class="error">{data.error}</div>
	{:else}
		<div class="search-bar">
			<div class="search-input-wrapper">
				<input 
					type="text" 
					bind:value={searchQuery} 
					placeholder={`${searchType}으로 검색...`} 
					class="search-input"
				/>
			</div>
			<div class="toggle-group">
				<button 
					class="toggle-btn" 
					class:active={searchType === '이름'} 
					onclick={() => searchType = '이름'}
				>이름</button>
				<button 
					class="toggle-btn" 
					class:active={searchType === '학과'} 
					onclick={() => searchType = '학과'}
				>학과</button>
			</div>
		</div>

		{#if filteredRows.length === 0}
			<p class="empty">검색 결과가 없습니다.</p>
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
						{#each filteredRows as row}
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
		text-align: center;
		padding: 2rem;
	}

	.search-bar {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		align-items: center;
	}

	.search-input-wrapper {
		flex: 1;
	}

	.search-input {
		width: 100%;
		padding: 0.6rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.95rem;
	}

	.toggle-group {
		display: flex;
		background: #f3f4f6;
		padding: 0.25rem;
		border-radius: 8px;
		border: 1px solid #e5e7eb;
	}

	.toggle-btn {
		padding: 0.4rem 1rem;
		border: none;
		background: transparent;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
		color: #6b7280;
		transition: all 0.2s;
	}

	.toggle-btn.active {
		background: white;
		color: #111827;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
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
