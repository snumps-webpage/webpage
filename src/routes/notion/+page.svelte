<script lang="ts">
	import type { PageData } from './$types';
	import type { NotionRow } from '$lib/types';

	let { data }: { data: PageData } = $props();
	
	let searchQuery = $state('');
	let searchType = $state(''); 
	
	// Initialize searchType on mount
	$effect(() => {
		if (!searchType && data.columns.length > 0) {
			searchType = data.columns[0].name;
		}
	});

	// Sorting state
	let sortColumn = $state<string | null>(null);
	let sortDirection = $state<'asc' | 'desc' | null>(null); // null is neutral

	let filteredRows = $derived.by(() => {
		let rows = searchQuery.trim() === '' 
			? [...(data.rows as NotionRow[])]
			: (data.rows as NotionRow[]).filter((row) => {
				const value = String(row[searchType] || '');
				return value.toLowerCase().includes(searchQuery.toLowerCase());
			});

		const currentSortCol = sortColumn;
		const currentSortDir = sortDirection;

		if (currentSortCol && currentSortDir) {
			rows.sort((a, b) => {
				const valA = String(a[currentSortCol] || '');
				const valB = String(b[currentSortCol] || '');
				
				// Standard localeCompare or simple comparison
				// Ascending: a < b -> -1
				const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
				return currentSortDir === 'asc' ? cmp : -cmp;
			});
		}
		
		return rows;
	});

	function toggleSort(columnName: string) {
		if (sortColumn !== columnName) {
			sortColumn = columnName;
			sortDirection = 'asc';
		} else {
			if (sortDirection === 'asc') {
				sortDirection = 'desc';
			} else if (sortDirection === 'desc') {
				sortDirection = null;
				sortColumn = null;
			} else {
				sortDirection = 'asc';
			}
		}
	}

	function getSortIcon(columnName: string) {
		if (sortColumn !== columnName) return '↕';
		if (sortDirection === 'desc') return '↑';
		if (sortDirection === 'asc') return '↓';
		return '↕';
	}
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
				{#each data.columns.slice(0, 2) as column (column.name)}
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
								<th>
									<button class="sort-header-btn" onclick={() => toggleSort(column.name)}>
										{column.label}
										<span class="sort-icon" class:active={sortColumn === column.name}>
											{getSortIcon(column.name)}
										</span>
									</button>
								</th>
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
		color: var(--text-primary);
		text-decoration: underline;
		font-weight: 500;
	}

	.notion-link:hover {
		opacity: 0.7;
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
		padding: 0;
	}

	.sort-header-btn {
		width: 100%;
		height: 100%;
		padding: 0.75rem 1rem;
		border: none;
		background: transparent;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.sort-header-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	:global(.dark) .sort-header-btn:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.sort-icon {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		opacity: 0.3;
	}

	.sort-icon.active {
		opacity: 1;
		color: var(--text-primary);
	}

	tr:hover td {
		background: var(--btn-secondary);
	}
</style>
