<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { getSemesterKeyFromDate } from '$lib/utils';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { PageData } from './$types';
	import type { Activity } from '$lib/types';

	let { data }: { data: PageData } = $props();
	const session = $derived(page.data.session);

	// Visibility states
	let showProfile = $state(true);
	let showSeminars = $state(true);
	let showStats = $state(true);

	// Filtering state
	let selectedSemester = $state('all');
	
	$effect(() => {
		if (data.currentSemesterKey) {
			selectedSemester = data.currentSemesterKey;
		}
	});

	// Seminar Edit state
	let editingSeminarId = $state<string | null>(null);
</script>

{#snippet collapsibleCard(title: string, bindValue: boolean, toggle: () => void, children: any)}
	<section class="card {bindValue ? '' : 'collapsed'}">
		<button 
			type="button"
			onclick={toggle} 
			class="card-header-toggle"
			aria-expanded={bindValue}
		>
			<h2>{title}</h2>
			<span class="chevron" aria-hidden="true">{bindValue ? '▼' : '▶'}</span>
		</button>
		{#if bindValue}
			<div class="card-content">
				{@render children()}
			</div>
		{/if}
	</section>
{/snippet}

<div class="container">
	{#if session?.user}
		<div class="dashboard-header">
			<h1>SNUMPS 활동 현황</h1>
			<p class="welcome">환영합니다, {session.user.name}님!</p>
		</div>

		{#await data.streamed.dashboard}
			<div class="dashboard-skeleton">
				<div class="card mb-4"><Skeleton width="100%" height="150px" /></div>
				<div class="card mb-4"><Skeleton width="100%" height="150px" /></div>
				<div class="card mb-4"><Skeleton width="100%" height="150px" /></div>
			</div>
		{:then result}
			{#if result && 'error' in result}
				<div class="error-banner">{result.error}</div>
			{:else if result}
				<div class="dashboard-grid">
					
					<!-- 1. Member Info (Collapsible) -->
					{@render collapsibleCard('회원 정보 관리', showProfile, () => showProfile = !showProfile, profileContent)}
					{#snippet profileContent()}
						<form method="POST" action="?/updateProfile" use:enhance>
							<div class="profile-summary">
								<div class="form-group">
									<label for="phone">전화번호</label>
									<input type="tel" id="phone" name="phone" value={result.profile.phone} placeholder="010-0000-0000" />
								</div>
								<div class="form-group">
									<label for="background">배경지식</label>
									<textarea id="background" name="background" rows="2" placeholder="관심 분야 등">{result.profile.background}</textarea>
								</div>
								<button class="btn-save">저장</button>
							</div>
						</form>
					{/snippet}

					<!-- 2. Manage Seminar (Collapsible) -->
					{@render collapsibleCard('세미나 관리', showSeminars, () => showSeminars = !showSeminars, seminarContent)}
					{#snippet seminarContent()}
						<div class="seminar-section">
							{#if result.approvedSeminars.length === 0 && result.seminarRequests.length === 0}
								<p class="empty-hint">참여 중인 세미나나 신청 내역이 없습니다.</p>
							{:else}
								<div class="seminar-list">
									{#each result.approvedSeminars as seminar}
										<div class="seminar-item approved">
											<div class="seminar-info">
												<span class="sem-tag">기록됨</span>
												{#if editingSeminarId === seminar.id}
													<form method="POST" action="?/updateSeminar" use:enhance={() => {
														return ({ result }) => { if (result.type === 'success') editingSeminarId = null; };
													}} class="edit-form">
														<input type="hidden" name="id" value={seminar.id} />
														<input type="text" name="title" value={seminar.title} class="edit-input" />
														<textarea name="remarks" class="edit-textarea">{seminar.remarks}</textarea>
														<div class="edit-actions">
															<button type="button" class="btn-cancel" onclick={() => editingSeminarId = null}>취소</button>
															<button class="btn-confirm">저장</button>
														</div>
													</form>
												{:else}
													<div class="view-mode">
														<span class="sem-title">{seminar.title}</span>
														<span class="sem-meta">{seminar.semester} | {seminar.remarks || '비고 없음'}</span>
														<button class="btn-edit-inline" onclick={() => editingSeminarId = seminar.id}>수정</button>
													</div>
												{/if}
											</div>
										</div>
									{/each}
									{#each result.seminarRequests as req}
										<div class="seminar-item request {req.status}">
											<div class="seminar-info">
												<span class="sem-tag status">{req.status === 'approved' ? '승인됨' : req.status === 'rejected' ? '반려됨' : '승인 대기'}</span>
												<span class="sem-title">{req.title}</span>
												<span class="sem-meta">{new Date(req.date).toLocaleDateString()} 신청</span>
											</div>
										</div>
									{/each}
								</div>
							{/if}
							<a href="/seminar/apply" class="btn-apply">🗣️ 새 세미나 신청</a>
						</div>
					{/snippet}

					<!-- 3. Attendance Stats (Restored to non-collapsible) -->
					<section class="stats-card">
						<h2>{data.semester} 출석 현황</h2>
						<div class="stats-grid">
							<div class="stat-item">
								<span class="stat-value">{result.myAttendanceStats.attended}</span>
								<span class="stat-label">출석</span>
							</div>
							<div class="stat-divider">/</div>
							<div class="stat-item">
								<span class="stat-value total">{result.myAttendanceStats.total}</span>
								<span class="stat-label">전체 활동</span>
							</div>
							<div class="stat-chart">
								{#if result.myAttendanceStats.total > 0}
									<div class="pie-chart" style="--percent: {(result.myAttendanceStats.attended / result.myAttendanceStats.total) * 100}%"></div>
								{/if}
							</div>
						</div>
					</section>
				</div>

				<!-- 4. Activities List (Restored Table View) -->
				<section class="activities-list">
					<div class="list-header">
						<h3>활동 목록</h3>
						<select bind:value={selectedSemester} class="semester-select">
							<option value="all">전체 활동</option>
							{#each result.semesters as sem}
								<option value={sem}>{sem}학기</option>
							{/each}
						</select>
					</div>

					{#if result.activities.filter((a: any) => selectedSemester === 'all' || getSemesterKeyFromDate(a.date) === selectedSemester).length === 0}
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
									{#each result.activities.filter((a: any) => selectedSemester === 'all' || getSemesterKeyFromDate(a.date) === selectedSemester) as activity (activity.id)}
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
			{/if}
		{/await}
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

	.dashboard-header {
		margin-bottom: 2rem;
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 1rem;
	}

	h1 { font-size: 1.75rem; color: var(--text-primary); margin: 0 0 0.5rem 0; }
	.welcome { color: var(--text-secondary); margin: 0; }

	.dashboard-grid {
		display: grid;
		gap: 1.5rem;
	}

	/* Card Styles */
	.card {
		background: var(--bg-secondary);
		border-radius: 12px;
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.card-header-toggle {
		width: 100%;
		border: none;
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		user-select: none;
		background: var(--btn-secondary);
		transition: background 0.2s;
		text-align: left;
	}

	.card-header-toggle:hover { background: var(--border-color); }
	.card-header-toggle h2 { margin: 0; font-size: 1.1rem; color: var(--text-primary); font-weight: 600; }
	.chevron { color: var(--text-secondary); font-size: 0.8rem; }

	.card-content { padding: 1.5rem; }

	/* Profile Summary */
	.profile-summary { display: grid; gap: 1rem; }
	.form-group { display: flex; flex-direction: column; gap: 0.4rem; }
	.form-group label { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
	.form-group input, .form-group textarea {
		padding: 0.6rem;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 0.95rem;
	}
	.btn-save {
		padding: 0.6rem;
		background: var(--text-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
	}

	/* Seminar Management */
	.seminar-section { display: grid; gap: 1rem; }
	.seminar-list { display: grid; gap: 0.75rem; }
	.seminar-item {
		padding: 1rem;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		background: var(--bg-primary);
	}
	.sem-tag {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		background: #e5e7eb;
		color: #4b5563;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		margin-bottom: 0.4rem;
		display: inline-block;
	}
	.sem-title { display: block; font-weight: 600; color: var(--text-primary); margin-bottom: 0.2rem; }
	.sem-meta { font-size: 0.85rem; color: var(--text-secondary); }
	
	.btn-edit-inline {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.edit-form { display: grid; gap: 0.5rem; margin-top: 0.5rem; }
	.edit-input, .edit-textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-secondary);
		color: var(--text-primary);
	}
	.edit-actions { display: flex; gap: 0.5rem; }
	.btn-confirm { background: #10b981; color: white; border: none; padding: 0.3rem 0.8rem; border-radius: 4px; cursor: pointer; }
	.btn-cancel { background: #6b7280; color: white; border: none; padding: 0.3rem 0.8rem; border-radius: 4px; cursor: pointer; }

	.btn-apply {
		text-align: center;
		padding: 0.75rem;
		background: #667eea;
		color: white;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9rem;
	}

	/* Stats Card */
	.stats-card {
		background: var(--bg-secondary);
		border-radius: 16px;
		padding: 2rem;
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

	.stats-grid { display: flex; align-items: center; gap: 1rem; }
	.stat-item { display: flex; flex-direction: column; align-items: center; }
	.stat-value { font-size: 2rem; font-weight: 700; color: #10b981; }
	.stat-value.total { color: var(--text-secondary); }
	.stat-label { font-size: 0.875rem; color: var(--text-secondary); }
	.stat-divider { font-size: 2rem; color: var(--border-color); font-weight: 300; }

	.stat-chart {
		margin-left: auto;
	}

	.pie-chart {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		background: conic-gradient(#10b981 var(--percent), #e5e7eb 0);
		transition: all 0.3s ease;
	}

	:global(.dark) .pie-chart {
		background: conic-gradient(#10b981 var(--percent), #374151 0);
	}

	/* Activities List */
	.activities-list {
		margin-top: 2rem;
		padding: 2rem;
		background: var(--bg-secondary);
		border-radius: 16px;
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.activities-list h3 {
		font-size: 1.25rem;
		margin: 0;
		color: var(--text-primary);
		font-weight: 600;
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
		padding: 0.2rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
		width: max-content;
	}

	.badge.success {
		background: #d1fae5;
		color: #059669;
	}

	.badge.fail {
		background: #fee2e2;
		color: #dc2626;
	}

	.loading, .error-banner, .empty-hint, .empty-state { text-align: center; padding: 2rem; color: var(--text-secondary); }

	/* Landing */
	.landing { text-align: center; padding: 4rem 1rem; }
	.login-link {
		display: inline-block;
		margin-top: 2rem;
		padding: 0.875rem 2rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 600;
	}
</style>
