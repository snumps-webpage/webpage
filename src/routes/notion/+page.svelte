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
			<!-- Desktop View: Table -->
			<div class="table-wrapper desktop-only">
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

			<!-- Mobile View: Cards -->
			<div class="mobile-only card-list">
				<div class="mobile-sort-row">
					{#each data.columns as column (column.name)}
						<button 
							class="mobile-sort-btn" 
							class:active={sortColumn === column.name}
							onclick={() => toggleSort(column.name)}
						>
							{column.label} {sortColumn === column.name ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</button>
					{/each}
				</div>
				{#each filteredRows as row (row.id)}
					<div class="member-card">
						<div class="card-header">
							<span class="member-name">{row[data.columns[0].name]}</span>
							<a href={row.link} target="_blank" rel="noopener noreferrer" class="notion-link">
								Notion 보기
							</a>
						</div>
						<div class="card-body">
							<div class="card-item">
								<span class="item-label">{data.columns[1].label}</span>
								<span class="item-value">{row[data.columns[1].name]}</span>
							</div>
							<div class="card-item">
								<span class="item-label">{data.columns[2].label}</span>
								<span class="item-value">{row[data.columns[2].name]}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
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
		padding: 4rem;
		background: var(--bg-secondary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
	}

	.search-bar {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		align-items: center;
		position: sticky;
		top: var(--nav-height); 
		background: var(--bg-primary); 
		padding: 1rem 0;
		z-index: 10; /* Lower than nav (50) */
		border-bottom: 1px solid var(--border-color);
		transition: all 0.2s;
	}

	/* Optional: add a subtle line when scrolling if you want to distinguish it from the page */
	:global(body:not([style*="overflow: hidden"])) .search-bar {
		border-bottom-color: var(--border-color);
	}

	.search-input-wrapper {
		flex: 1;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		font-size: 1rem;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-family: var(--font-body);
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
		padding: 0.5rem 1.25rem;
		border: none;
		background: transparent;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
		color: var(--text-secondary);
		transition: all 0.2s;
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.toggle-btn.active {
		background: var(--bg-primary);
		color: var(--text-primary);
		box-shadow: var(--shadow);
	}

	.table-wrapper {
		overflow-x: auto;
		border-radius: 8px;
		box-shadow: var(--shadow);
		border: 1px solid var(--border-color);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--bg-secondary);
	}

	th,
	td {
		padding: 1rem;
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
		padding: 1rem;
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
		background: var(--bg-primary);
	}

	.notion-link {
		color: var(--text-primary);
		text-decoration: underline;
		font-weight: 500;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.notion-link:hover {
		opacity: 0.7;
	}

	/* Mobile View Styles */
	.mobile-only {
		display: none;
	}

	.card-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.member-card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 1.25rem;
		box-shadow: var(--shadow);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border-color);
	}

	.member-name {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 600;
		font-style: italic;
	}

	.card-body {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.card-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.item-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: var(--font-mono);
	}

	.item-value {
		font-size: 1rem;
		color: var(--text-primary);
	}

	.mobile-sort-row {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;
		scrollbar-width: none;
	}

	.mobile-sort-row::-webkit-scrollbar {
		display: none;
	}

	.mobile-sort-btn {
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 99px;
		padding: 0.4rem 0.8rem;
		font-size: 0.75rem;
		font-family: var(--font-mono);
		white-space: nowrap;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.mobile-sort-btn.active {
		background: var(--text-primary);
		color: var(--bg-primary);
		border-color: var(--text-primary);
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		.desktop-only {
			display: none;
		}

		.mobile-only {
			display: flex;
		}

		.search-bar {
			flex-direction: column;
			align-items: stretch;
			top: var(--nav-height); 
			padding: 0.75rem 0;
			gap: 0.75rem;
		}

		.toggle-group {
			width: 100%;
		}

		.toggle-btn {
			flex: 1;
		}
	}
</style>
