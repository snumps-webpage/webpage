<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
    import { signIn } from '@auth/sveltekit/client';
    import { goto } from '$app/navigation';
	import { getSemesterKeyFromDate } from '$lib/utils';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const session = $derived(page.data.session);
    const isAdmin = $derived(page.data.isAdmin);
    const isMember = $derived(data.isMember);

	// Visibility states
	let showProfile = $state(false); // Default to false to keep view clean
	let showSeminars = $state(false);

	// Filtering state
	let selectedSemester = $state('all');
	let attendanceFilter = $state('all');
	let typeFilter = $state('all');
	
	$effect(() => {
		if (data.currentSemesterKey) {
			selectedSemester = data.currentSemesterKey;
		}
	});

	// Seminar Edit state
	let editingSeminarId = $state<string | null>(null);

    let isRefreshing = $state(false);

    // Optimized: Store resolved data in local state to prevent Promise recreation on every render
    let dashboardData = $state<any>(null); // Type 'any' used temporarily to avoid deep type import issues, ideally strictly typed

    // Resolve stream once
    $effect(() => {
        data.streamed.dashboard.then(result => {
            if (result && !('error' in result)) {
                dashboardData = result;
            }
        });
    });

    // Purely synchronous filtering - FAST
    let filteredActivities = $derived(
        dashboardData 
            ? dashboardData.activities.filter((a: any) => 
                (selectedSemester === 'all' || a.semester === selectedSemester) &&
                (attendanceFilter === 'all' || (attendanceFilter === 'attended' ? a.attended : !a.attended)) &&
                (typeFilter === 'all' || a.type === typeFilter)
            )
            : []
    );

    async function refreshDashboard() {
        if (isRefreshing) return;
        isRefreshing = true;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('refresh', Date.now().toString());
            await goto(url.toString(), { replaceState: true, invalidateAll: true });
        } finally {
            isRefreshing = false;
        }
    }
</script>

{#snippet collapsibleCard(title: string, bindValue: boolean, toggle: () => void, children: import('svelte').Snippet)}
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
        {#if isMember || isAdmin}
            <div class="dashboard-header">
                <h1 class="no-sel">활동 현황</h1>
                <button 
                    class="refresh-dashboard-btn" 
                    onclick={refreshDashboard} 
                    disabled={isRefreshing}
                    aria-label="Refresh Dashboard"
                >
                    <!-- <span class="refresh-icon" class:spinning={isRefreshing}>🔄</span> -->
                    새로고침
                </button>
            </div>

            {#await data.streamed.dashboard}
                <div class="dashboard-skeleton">
                    <div class="card mb-4"><Skeleton width="100%" height="150px" /></div>
                    <div class="card mb-4"><Skeleton width="100%" height="150px" /></div>
                    <div class="card mb-4"><Skeleton width="100%" height="150px" /></div>
                </div>
            {:then result}
                {#if result && 'error' in result}
                    <div class="dashboard-grid">
                        <section class="card stats-card error-state">
                            <h2>연결 실패</h2>
                            <div class="error-content">
                                <span class="error-icon">⚠️</span>
                                <p class="error-msg">{result.error}</p>
                                <p class="retry-hint">서버와의 통신이 원활하지 않습니다.<br>잠시 후 우측 상단의 '새로고침' 버튼을 눌러주세요.</p>
                            </div>
                        </section>
                        
                        <!-- Empty slots for layout continuity -->
                        <section class="card collapsed disabled">
                            <div class="card-header-toggle">
                                <h2>회원 정보 관리</h2>
                                <span class="chevron">-</span>
                            </div>
                        </section>

                        <section class="card collapsed disabled">
                            <div class="card-header-toggle">
                                <h2>세미나 관리</h2>
                                <span class="chevron">-</span>
                            </div>
                        </section>
                    </div>
                {:else if result}
                    <div class="dashboard-grid">
						
						<!-- 1. Manage Seminar (Collapsible) -->
                        {@render collapsibleCard('세미나 관리', showSeminars, () => showSeminars = !showSeminars, seminarContent)}
                        {#snippet seminarContent()}
						<div class="seminar-section">
							<a href="/seminar/apply" class="btn-apply">새 세미나 신청</a>
							{#if result.approvedSeminars.length === 0 && result.seminarRequests.length === 0}
							<p class="empty-hint no-sel">참여 중인 세미나나 신청 내역이 없습니다.</p>
							{:else}
							<div class="seminar-list">
								{#each result.approvedSeminars as seminar (seminar.id)}
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
												{#each result.seminarRequests as req (req.id)}
												<div class="seminar-item request {req.status}">
													<div class="seminar-info">
														<span class="sem-tag status">{req.status === 'approved' ? '승인됨' : req.status === 'rejected' ? '반려됨' : '승인 대기'}</span>
														<span class="sem-title">{req.title}</span>
														<span class="sem-meta">{new Date(req.submittedAt).toLocaleDateString()} 신청</span>
													</div>
												</div>
												{/each}
											</div>
											{/if}
										</div>
										{/snippet}
										
						                        <!-- 2. Member Info (Collapsible) -->
												{@render collapsibleCard('회원 정보 관리', showProfile, () => showProfile = !showProfile, profileContent)}
												{#snippet profileContent()}						
													<form method="POST" action="?/updateProfile" use:enhance>
														<div class="profile-summary">
															<div class="form-group">
																<label for="phone" class="no-sel">전화번호</label>										<input 
											type="tel" 
											id="phone" 
											name="phone" 
											value={result.profile.phone} 
											placeholder="010-1234-5678" 
											pattern="010[- ]?\d&#123;3,4&#125;[- ]?\d&#123;4&#125;"
											title="숫자만 입력하거나 하이픈(-) 또는 공백을 포함할 수 있습니다."
										/>
									</div>
									<div class="form-group">
										<label for="background" class="no-sel">배경지식</label>
										<textarea id="background" name="background" rows="2" placeholder="관심 분야 등" style="min-height: 20vh">{result.profile.background}</textarea>
									</div>
									<button class="btn-save">저장</button>
								</div>
							</form>
						{/snippet}
																				
										<!-- 3. Attendance Stats -->
                        <section class="stats-card no-sel">
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
                            <h3 class="no-sel">활동 목록</h3>
                            <div class="filters">
                                <select bind:value={typeFilter} class="semester-select">
                                    <option value="all">전체 종류</option>
                                    {#each Array.from(new Set(result.activities.map((a: any) => a.type))) as type (type)}
                                        <option value={type}>{type}</option>
                                    {/each}
                                </select>
                                <select bind:value={attendanceFilter} class="semester-select">
                                    <option value="all">전체 상태</option>
                                    <option value="attended">출석</option>
                                    <option value="absent">결석</option>
                                </select>
                                <select bind:value={selectedSemester} class="semester-select">
                                    <option value="all">전체 학기</option>
                                    {#each result.semesters as sem (sem)}
                                        <option value={sem}>{sem}학기</option>
                                    {/each}
                                </select>
                            </div>
                        </div>

                        {#if filteredActivities.length === 0}
                            <p class="empty-state">조건에 맞는 활동 내역이 없습니다.</p>
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
                                                <td><span class="tag no-sel">{activity.type}</span></td>
                                                <td class="status">
                                                    {#if activity.attended}
                                                        <span class="badge success no-sel">출석</span>
                                                    {:else}
                                                        <span class="badge fail no-sel">결석</span>
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
        {/if}
	{:else}
		<div class="landing-hero no-sel">
			<h1>서울대학교 수학문제연구회</h1>
			<p class="subtitle">SNUMPS</p>
            <div class="login-container">
                <button class="google-login-btn" onclick={() => signIn('google')}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>서울대학교 구글 계정으로 로그인</span>
                </button>
                <p class="login-hint">@snu.ac.kr 계정만 이용 가능합니다.</p>
            </div>
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
		border-bottom: 2px solid var(--border-color);
		padding-bottom: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

    .refresh-dashboard-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        padding: 0.5rem 1rem;
        border-radius: 99px;
        cursor: pointer;
        font-size: 0.8rem;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-family: var(--font-mono);
        font-weight: 600;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .refresh-dashboard-btn:hover:not(:disabled) {
        background: var(--text-primary);
        color: var(--bg-primary);
        border-color: var(--text-primary);
    }

    .refresh-dashboard-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

	h1 { font-size: 2rem; color: var(--text-primary); margin: 0; font-family: var(--font-display); }

	.dashboard-grid {
		display: grid;
		gap: 2rem;
	}

	/* Card Styles */
	.card {
		background: var(--bg-secondary);
		border-radius: 8px; 
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
		overflow: hidden;
        animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

    .dashboard-grid > :nth-child(1) { animation-delay: 0.1s; }
    .dashboard-grid > :nth-child(2) { animation-delay: 0.2s; }
    .dashboard-grid > :nth-child(3) { animation-delay: 0.3s; }

	.card-header-toggle {
		width: 100%;
		border: none;
		border-bottom: 1px solid var(--border-color);
		padding: 1.25rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		user-select: none;
		background: var(--bg-primary);
		transition: background 0.2s;
		text-align: left;
	}

	.card-header-toggle:hover { background: var(--bg-secondary); }
	.card-header-toggle h2 { 
		margin: 0; 
		font-size: 1.15rem; 
		color: var(--text-primary); 
		font-weight: 600; 
		font-family: var(--font-display);
        font-style: italic;
	}
	.chevron { color: var(--text-secondary); font-size: 0.8rem; font-family: var(--font-mono); }

	.card-content { padding: 1.5rem; background: var(--bg-secondary); }

	/* Profile Summary */
	.profile-summary { display: grid; gap: 1.5rem; }
	.form-group { display: flex; flex-direction: column; gap: 0.5rem; }
	.form-group label { 
		font-size: 0.75rem; 
		font-weight: 700; 
		color: var(--text-secondary); 
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.form-group input, .form-group textarea {
		padding: 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 1rem;
		resize: none;
		font-family: var(--font-body);
        transition: border-color 0.2s;
	}
	.form-group input:focus, .form-group textarea:focus {
		outline: none;
		border-color: var(--text-primary);
	}
	.btn-save {
		padding: 0.75rem;
		background: var(--text-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--font-mono);
		transition: opacity 0.2s, transform 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.05em;
	}
	.btn-save:hover { opacity: 0.9; transform: translateY(-1px); }

	/* Seminar Management */
	.seminar-section { display: grid; gap: 1.25rem; }
	.seminar-list { display: grid; gap: 1rem; }
	.seminar-item {
		padding: 1.25rem;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		background: var(--bg-primary);
        position: relative;
	}
	.sem-tag {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		padding: 0.25rem 0.5rem;
		border-radius: 3px;
		margin-bottom: 0.75rem;
		display: inline-block;
		letter-spacing: 0.05em;
        font-family: var(--font-mono);
	}
	.sem-title { 
		display: block; 
		font-weight: 600; 
		color: var(--text-primary); 
		margin-bottom: 0.25rem; 
		font-family: var(--font-display);
		font-size: 1.2rem;
	}
	.sem-meta { font-size: 0.9rem; color: var(--text-secondary); font-family: var(--font-body); font-style: italic; }
	
	.btn-edit-inline {
		margin-top: 1rem;
		font-size: 0.75rem;
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.4rem 0.8rem;
		border-radius: 4px;
		color: var(--text-primary);
		cursor: pointer;
		font-weight: 600;
        font-family: var(--font-mono);
        text-transform: uppercase;
	}
	.btn-edit-inline:hover { background: var(--text-primary); color: var(--bg-primary); }

	.edit-form { display: grid; gap: 0.75rem; margin-top: 0.75rem; }
	.edit-input, .edit-textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-family: var(--font-body);
	}
	.edit-actions { display: flex; gap: 0.75rem; }
	.btn-confirm { 
		background: var(--color-success-text); 
		color: white; 
		border: none; 
		padding: 0.5rem 1rem; 
		border-radius: 4px; 
		cursor: pointer; 
		font-weight: 600; 
        font-family: var(--font-mono);
	}
	.btn-cancel { 
		background: var(--text-secondary); 
		color: white; 
		border: none; 
		padding: 0.5rem 1rem; 
		border-radius: 4px; 
		cursor: pointer; 
		font-weight: 600; 
        font-family: var(--font-mono);
	}

	.btn-apply {
		text-align: center;
		padding: 1rem;
		background: var(--text-primary);
		color: var(--bg-primary);
		text-decoration: none;
		border-radius: 4px;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.2s;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.05em;
	}
	.btn-apply:hover { transform: translateY(-2px); box-shadow: var(--shadow); }

	/* Stats Card */
	.stats-card {
		background: var(--bg-secondary);
		border-radius: 8px;
		padding: 2rem;
		box-shadow: var(--shadow);
		margin-bottom: 2rem;
		border: 1px solid var(--border-color);
	}

	.stats-card h2 {
		margin: 0 0 1.5rem 0;
		font-size: 1.2rem;
		color: var(--text-primary);
		font-weight: 600;
		font-family: var(--font-display);
        font-style: italic;
	}

	.stats-grid { display: flex; align-items: center; gap: 2rem; }
	.stat-item { display: flex; flex-direction: column; align-items: center; }
	.stat-value { font-size: 3rem; font-weight: 500; color: var(--text-primary); font-family: var(--font-display); line-height: 1; }
	.stat-value.total { color: var(--text-secondary); opacity: 0.4; }
	.stat-label { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.15em; margin-top: 0.5rem; font-family: var(--font-mono); font-weight: 700; }
	.stat-divider { font-size: 2.5rem; color: var(--border-color); font-weight: 300; font-family: var(--font-display); }

	.stat-chart { margin-left: auto; }
	.pie-chart {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: conic-gradient(var(--text-primary) var(--percent), var(--border-color) 0);
		transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        border: 1px solid var(--border-color);
	}

	/* Activities List */
	.activities-list {
		margin-top: 2rem;
		padding: 2.5rem;
		background: var(--bg-secondary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
        animation: slide-up-fade 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both;
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 1.25rem;
	}

	.filters { display: flex; gap: 0.75rem; }

	.activities-list h3 {
		font-size: 1.5rem;
		margin: 0;
		color: var(--text-primary);
		font-weight: 600;
		font-family: var(--font-display);
	}

	.semester-select {
		padding: 0.5rem 2rem 0.5rem 1rem;
		border-radius: 99px;
		border: 1px solid var(--border-color);
		font-size: 0.75rem;
		background: var(--bg-primary);
		color: var(--text-primary);
		cursor: pointer;
		font-family: var(--font-mono);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%232a2f35' d='M0 2l4 4 4-4z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 1rem center;
	}

	.table-container {
		background: var(--bg-primary);
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid var(--border-color);
	}

	table { width: 100%; border-collapse: collapse; text-align: left; }
	th {
		background: var(--bg-secondary);
		padding: 1rem;
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		border-bottom: 1px solid var(--border-color);
        font-family: var(--font-mono);
	}
	td {
		padding: 1.25rem 1rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--text-primary);
		font-size: 1rem;
        font-family: var(--font-body);
	}
	tr:last-child td { border-bottom: none; }

	.date { white-space: nowrap; color: var(--text-secondary); font-size: 0.85rem; font-family: var(--font-mono); }
	.activity-link {
		color: var(--text-primary);
		text-decoration: none;
		border-bottom: 1px solid var(--border-color);
		transition: all 0.2s;
		font-weight: 500;
        font-family: var(--font-display);
        font-style: italic;
	}
	.activity-link:hover { border-bottom-color: var(--text-primary); background: rgba(0,0,0,0.03); }

	.tag {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		border-radius: 3px;
		font-size: 0.65rem;
		white-space: nowrap;
		font-weight: 700;
        font-family: var(--font-mono);
        text-transform: uppercase;
	}

	.badge {
		display: inline-block;
		padding: 0.3rem 0.75rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 700;
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.05em;
        font-family: var(--font-mono);
	}
	.badge.success { background: var(--color-success-bg); color: var(--color-success-text); }
	.badge.fail { background: var(--color-danger-bg); color: var(--color-danger-text); }

	.empty-state { text-align: center; padding: 4rem; color: var(--text-secondary); font-style: italic; font-family: var(--font-body); }

	/* Landing Hero */
    .landing-hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 85vh;
        text-align: center;
        animation: slide-up-fade 1s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .landing-hero h1 {
        font-size: clamp(2.5rem, 8vw, 4.5rem);
        margin-bottom: 0.5rem;
        color: var(--text-primary);
        font-family: var(--font-display);
        font-weight: 600;
        letter-spacing: -0.03em;
    }

    .landing-hero .subtitle {
        font-size: 1.25rem;
        color: var(--text-secondary);
        margin-bottom: 4rem;
        font-family: var(--font-mono);
        font-weight: 400;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }

    .google-login-btn {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        padding: 1.25rem 2.5rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 99px;
        color: var(--text-primary);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: var(--shadow);
        font-family: var(--font-display);
        font-size: 1.1rem;
        font-style: italic;
    }

    .google-login-btn:hover {
        background: var(--text-primary);
        color: var(--bg-primary);
        transform: translateY(-4px);
        box-shadow: 0 12px 24px -6px rgba(0,0,0,0.15);
    }

    .login-hint { font-size: 0.85rem; color: var(--text-secondary); font-style: italic; margin-top: 1.5rem; font-family: var(--font-body); }

    /* Utilities */
    @keyframes slide-up-fade {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
