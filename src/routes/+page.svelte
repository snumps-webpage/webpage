<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { getSemesterKeyFromDate } from '$lib/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const session = $derived(page.data.session);

	let selectedSemester = $state('all');
	
	// Set initial semester once data is available
	$effect(() => {
		if (data.currentSemesterKey) {
			selectedSemester = data.currentSemesterKey;
		}
	});

	let filteredActivities = $derived(
		selectedSemester === 'all' 
			? data.activities 
			: data.activities.filter((a: any) => {
				const sem = getSemesterKeyFromDate(a.date);
				return sem === selectedSemester;
			})
	);
</script>

<div class="container">
	{#if session?.user}
		<div class="header">
			<div>
				<h1>SNUMPS 활동 현황</h1>
				<p class="welcome">환영합니다, {session.user.name}님!</p>
			</div>
		</div>

		<div class="dashboard">
			{#if data.error}
				<div class="error-banner">
					⚠️ {data.error}
				</div>
			{/if}

			<section class="stats-card">
				<h2>{data.semester} 출석 현황</h2>
				{#if data.myAttendanceStats}
					<div class="stats-grid">
						<div class="stat-item">
							<span class="stat-value">{data.myAttendanceStats.attended}</span>
							<span class="stat-label">출석</span>
						</div>
						<div class="stat-divider">/</div>
						<div class="stat-item">
							<span class="stat-value total">{data.myAttendanceStats.total}</span>
							<span class="stat-label">전체 활동</span>
						</div>
						<div class="stat-chart">
							{#if data.myAttendanceStats.total > 0}
								<div class="pie-chart" style="--percent: {(data.myAttendanceStats.attended / data.myAttendanceStats.total) * 100}%"></div>
							{/if}
						</div>
					</div>
				{/if}
			</section>

			<section class="activities-list">
				<div class="list-header">
					<h3>활동 목록</h3>
					<select bind:value={selectedSemester} class="semester-select">
						<option value="all">전체 활동</option>
						{#each data.semesters as sem (sem)}
							<option value={sem}>{sem}학기</option>
						{/each}
					</select>
				</div>

				{#if filteredActivities.length === 0}
					<p class="empty-state">활동 내역이 없습니다.</p>
				{:else}
					<div class="table-container">
						<table>
							<thead>
								<tr>
									<th>날짜</th>
									<th>활동명</th>
									<th>종류</th>
									<th>출석</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredActivities as activity (activity.id)}
									<tr class={activity.attended ? 'attended' : 'absent'}>
										<td class="date">{activity.date}</td>
										<td class="name">
											<a href={activity.url} target="_blank" rel="noopener noreferrer" class="activity-link">
												{activity.name}
											</a>
										</td>
										<td><span class="tag">{activity.type}</span></td>
										<td class="status">
											{#if activity.attended}
												<span class="badge success">출석</span>
											{:else}
												<span class="badge fail">결석</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		</div>

	{:else}
		<div class="landing">
			<h1>SNUMPS 자동화</h1>
			<p>동아리 노션 자동화 시스템입니다.</p>
			<a href="/login" class="login-link">로그인하기</a>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	/* Header */
	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	h1 {
		font-size: 1.75rem;
		color: var(--text-primary);
		margin: 0 0 0.5rem 0;
	}

	.welcome {
		color: var(--text-secondary);
		margin: 0;
	}

	/* Stats Card */
	.stats-card {
		background: var(--bg-secondary);
		border-radius: 16px; /* Softer corners */
		padding: 2rem; /* More whitespace */
		box-shadow: var(--shadow);
		margin-bottom: 2rem;
		border: 1px solid var(--border-color);
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.stats-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
	}

	.stats-card h2 {
		margin: 0 0 1.5rem 0;
		font-size: 1.25rem;
		color: var(--text-primary);
		font-weight: 600;
	}

	.stats-grid {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		color: #10b981;
		line-height: 1;
	}
	
	.stat-value.total {
		color: var(--text-secondary);
	}

	.stat-label {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-top: 0.25rem;
	}

	.stat-divider {
		font-size: 2rem;
		color: var(--border-color);
		font-weight: 300;
	}

	/* Activities List */
	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.activities-list h3 {
		font-size: 1.25rem;
		margin: 0;
		color: var(--text-primary);
	}

	.semester-select {
		padding: 0.4rem 2rem 0.4rem 0.8rem;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		font-size: 0.875rem;
		background: var(--bg-secondary);
		color: var(--text-primary);
		cursor: pointer;
	}

	.table-container {
		background: var(--bg-secondary);
		border-radius: 12px;
		box-shadow: var(--shadow);
		overflow: hidden;
		border: 1px solid var(--border-color);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}

	th {
		background: var(--btn-secondary);
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
		border-bottom: 1px solid var(--border-color);
	}

	td {
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--text-primary);
	}

	tr:last-child td {
		border-bottom: none;
	}

	.date {
		white-space: nowrap;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.activity-link {
		color: inherit;
		text-decoration: none;
		transition: color 0.2s;
	}

	.activity-link:hover {
		color: #667eea;
		text-decoration: underline;
	}

	.tag {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: var(--btn-secondary);
		color: var(--text-secondary);
		border-radius: 4px;
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.badge {
		display: inline-block;
		padding: 0.2rem 0.75rem; /* Increased horizontal padding */
		border-radius: 9999px;
		font-size: 0.7rem; /* Slightly smaller font */
		font-weight: 600;
		white-space: nowrap; /* Prevent awkward line breaks */
		width: max-content;
	}

	.badge.success {
		background: var(--color-success-bg);
		color: var(--color-success-text);
	}

	.badge.fail {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
	}

	.error-banner {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	/* Landing */
	.landing {
		text-align: center;
		padding: 4rem 1rem;
	}

	.landing h1 {
		font-size: 2.5rem;
		margin-bottom: 1rem;
	}

	.login-link {
		display: inline-block;
		margin-top: 2rem;
		padding: 0.875rem 2rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 1.1rem;
		box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);
		user-select: none;
	}

	.landing .login-link:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 10px rgba(102, 126, 234, 0.5);
	}
</style>
