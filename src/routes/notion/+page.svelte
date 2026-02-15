<script lang="ts">
	import type { PageData } from './$types';
	import type { NotionRow } from '$lib/types';

	let { data }: { data: PageData } = $props();
	
	let searchQuery = $state('');
	let searchType = $state(data.columns[0]?.name || ''); // Default to first column

	let filteredRows = $derived(
		searchQuery.trim() === '' 
			? data.rows as NotionRow[]
			: (data.rows as NotionRow[]).filter((row) => {
				const value = String(row[searchType] || '');
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
					placeholder={`${data.columns.find(c => c.name === searchType)?.label || '검색'}으로 검색...`} 
					class="search-input"
				/>
			</div>
			<div class="toggle-group">
				{#each data.columns.slice(0, 2) as column}
					<button 
						class="toggle-btn" 
						class:active={searchType === column.name} 
						onclick={() => searchType = column.name}
					>{column.label}</button>
				{/each}
			</div>
		</div>

		{#if filteredRows.length === 0}
			<p class="empty">검색 결과가 없습니다.</p>
		{:else}
			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							{#each data.columns as column (column.name)}
								<th>{column.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each filteredRows as row (row.id)}
							<tr>
								{#each data.columns as column (column.name)}
									<td>
										{#if column.name === 'link'}
											<a href={row[column.name]} target="_blank" rel="noopener noreferrer" class="notion-link">
												보기
											</a>
										{:else}
											{row[column.name]}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.notion-link {
		color: var(--text-accent);
		text-decoration: none;
		font-weight: 500;
	}

	.notion-link:hover {
		text-decoration: underline;
	}

	h1 {
		margin-bottom: 1.5rem;
		color: var(--text-primary);
	}

	.error {
		background: #fee2e2;
		color: #dc2626;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.empty {
		color: var(--text-secondary);
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
		border: 1px solid var(--border-color);
		border-radius: 8px;
		font-size: 0.95rem;
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.toggle-group {
		display: flex;
		background: var(--btn-secondary);
		padding: 0.25rem;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		user-select: none;
	}

	.toggle-btn {
		padding: 0.4rem 1rem;
		border: none;
		background: transparent;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
		color: var(--text-secondary);
		transition: all 0.2s;
		user-select: none;
	}

	.toggle-btn.active {
		background: var(--bg-secondary);
		color: var(--text-primary);
		box-shadow: var(--shadow);
	}

	.table-wrapper {
		overflow-x: auto;
		border-radius: 8px;
		box-shadow: var(--shadow);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--bg-secondary);
	}

	th,
	td {
		padding: 0.75rem 1rem;
		text-align: left;
		border-bottom: 1px solid var(--border-color);
		color: var(--text-primary);
	}

	th {
		background: var(--btn-secondary);
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
	}

	tr:hover td {
		background: var(--btn-secondary);
	}
</style>