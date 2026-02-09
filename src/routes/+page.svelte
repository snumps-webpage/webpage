<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
    import { signIn } from '@auth/sveltekit/client';
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
	
	$effect(() => {
		if (data.currentSemesterKey) {
			selectedSemester = data.currentSemesterKey;
		}
	});

	// Seminar Edit state
	let editingSeminarId = $state<string | null>(null);
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
                <h1>SNUMPS 활동 현황</h1>
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
                                        <input 
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
                            <div class="filters">
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

                        {#if result.activities.filter((a) => 
                            (selectedSemester === 'all' || getSemesterKeyFromDate(a.date) === selectedSemester) &&
                            (attendanceFilter === 'all' || (attendanceFilter === 'attended' ? a.attended : !a.attended))
                        ).length === 0}
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
                                        {#each result.activities.filter((a) => 
                                            (selectedSemester === 'all' || getSemesterKeyFromDate(a.date) === selectedSemester) &&
                                            (attendanceFilter === 'all' || (attendanceFilter === 'attended' ? a.attended : !a.attended))
                                        ) as activity (activity.id)}
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
        {/if}
	{:else}
		<div class="landing-hero">
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
	}

	h1 { font-size: 2rem; color: var(--text-primary); margin: 0; letter-spacing: -0.02em; }
	.welcome { color: var(--text-secondary); margin: 0; font-size: 1rem; font-family: "Inter", "Noto Sans KR", sans-serif; }

	.dashboard-grid {
		display: grid;
		gap: 2rem;
	}

	/* Card Styles */
	.card {
		background: var(--bg-secondary);
		border-radius: 8px; /* Sharper */
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.card-header-toggle {
		width: 100%;
		border: none;
		border-bottom: 1px solid var(--border-color);
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		user-select: none;
		background: var(--bg-primary);
		transition: background 0.2s;
		text-align: left;
	}

	.card-header-toggle:hover { background: var(--btn-secondary); }
	.card-header-toggle h2 { 
		margin: 0; 
		font-size: 1.1rem; 
		color: var(--text-primary); 
		font-weight: 700; 
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
	}
	.chevron { color: var(--text-secondary); font-size: 0.8rem; }

	.card-content { padding: 1.5rem; background: var(--bg-secondary); }

	/* Profile Summary */
	.profile-summary { display: grid; gap: 1.25rem; }
	.form-group { display: flex; flex-direction: column; gap: 0.5rem; }
	.form-group label { 
		font-size: 0.85rem; 
		font-weight: 700; 
		color: var(--text-primary); 
		font-family: "Inter", "Noto Sans KR", sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.form-group input, .form-group textarea {
		padding: 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 0.95rem;
		resize: none;
		font-family: "Inter", "Noto Sans KR", sans-serif;
	}
	.form-group input[type="tel"] {
		font-family: var(--font-mono);
	}
	.form-group input:focus, .form-group textarea:focus {
		outline: 2px solid var(--text-primary);
		border-color: transparent;
	}
	.btn-save {
		padding: 0.75rem;
		background: var(--text-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: 4px;
		font-weight: 700;
		cursor: pointer;
		font-family: "Inter", "Noto Sans KR", sans-serif;
		transition: opacity 0.2s;
	}
	.btn-save:hover { opacity: 0.9; }

	/* Seminar Management */
	.seminar-section { display: grid; gap: 1.25rem; }
	.seminar-list { display: grid; gap: 1rem; }
	.seminar-item {
		padding: 1.25rem;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		background: var(--bg-primary);
	}
	.sem-tag {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		background: var(--btn-secondary);
		color: var(--text-secondary);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.5rem;
		display: inline-block;
		letter-spacing: 0.05em;
	}
	.sem-title { 
		display: block; 
		font-weight: 700; 
		color: var(--text-primary); 
		margin-bottom: 0.25rem; 
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
		font-size: 1.1rem;
	}
	.sem-meta { font-size: 0.85rem; color: var(--text-secondary); font-family: "Inter", "Noto Sans KR", sans-serif; }
	
	.btn-edit-inline {
		margin-top: 0.75rem;
		font-size: 0.8rem;
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.3rem 0.6rem;
		border-radius: 4px;
		color: var(--text-primary);
		cursor: pointer;
		font-weight: 600;
	}
	.btn-edit-inline:hover { background: var(--btn-secondary); }

	.edit-form { display: grid; gap: 0.75rem; margin-top: 0.75rem; }
	.edit-input, .edit-textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-family: "Inter", "Noto Sans KR", sans-serif;
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
	}
	.btn-cancel { 
		background: var(--text-secondary); 
		color: white; 
		border: none; 
		padding: 0.5rem 1rem; 
		border-radius: 4px; 
		cursor: pointer; 
		font-weight: 600; 
	}

	.btn-apply {
		text-align: center;
		padding: 0.8rem;
		background: var(--text-primary);
		color: var(--bg-primary);
		text-decoration: none;
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.95rem;
		transition: opacity 0.2s;
	}
	.btn-apply:hover { opacity: 0.9; }

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
		font-size: 1.25rem;
		color: var(--text-primary);
		font-weight: 700;
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
	}

	.stats-grid { display: flex; align-items: center; gap: 2rem; }
	.stat-item { display: flex; flex-direction: column; align-items: center; }
	.stat-value { font-size: 2.5rem; font-weight: 700; color: var(--text-primary); font-family: "Playfair Display", "Nanum Myeongjo", serif; }
	.stat-value.total { color: var(--text-secondary); opacity: 0.5; }
	.stat-label { font-size: 0.875rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.5rem; }
	.stat-divider { font-size: 2.5rem; color: var(--border-color); font-weight: 300; font-family: "Playfair Display", "Nanum Myeongjo", serif; }

	.stat-chart {
		margin-left: auto;
	}

	.pie-chart {
		width: 70px;
		height: 70px;
		border-radius: 50%;
		background: conic-gradient(var(--text-primary) var(--percent), var(--border-color) 0);
		transition: all 0.3s ease;
	}

	/* Activities List */
	.activities-list {
		margin-top: 2rem;
		padding: 2rem;
		background: var(--bg-secondary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--border-color);
		padding-bottom: 1rem;
	}

	.filters {
		display: flex;
		gap: 0.5rem;
	}

	.activities-list h3 {
		font-size: 1.25rem;
		margin: 0;
		color: var(--text-primary);
		font-weight: 700;
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
	}

	.semester-select {
		padding: 0.5rem 2rem 0.5rem 1rem;
		border-radius: 4px;
		border: 1px solid var(--border-color);
		font-size: 0.875rem;
		background: var(--bg-primary);
		color: var(--text-primary);
		cursor: pointer;
		font-family: "Inter", "Noto Sans KR", sans-serif;
	}

	.table-container {
		background: var(--bg-secondary);
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid var(--border-color);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}

	th {
		background: var(--bg-primary);
		padding: 1rem;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 2px solid var(--border-color);
	}

	td {
		padding: 1rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--text-primary);
		font-size: 0.95rem;
	}

	tr:last-child td {
		border-bottom: none;
	}

	.date {
		white-space: nowrap;
		color: var(--text-secondary);
		font-size: 0.9rem;
		font-family: var(--font-mono);
	}

	.activity-link {
		color: var(--text-primary);
		text-decoration: none;
		border-bottom: 1px solid transparent;
		transition: border-color 0.2s;
		font-weight: 600;
	}

	.activity-link:hover {
		border-bottom-color: var(--text-primary);
	}

	.tag {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: var(--btn-secondary);
		color: var(--text-secondary);
		border-radius: 4px;
		font-size: 0.75rem;
		white-space: nowrap;
		font-weight: 600;
	}

	.badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 700;
		white-space: nowrap;
		width: max-content;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.badge.success {
		background: var(--color-success-bg);
		color: var(--color-success-text);
	}

	.badge.fail {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
	}

	.loading, .error-banner, .empty-hint, .empty-state { text-align: center; padding: 2rem; color: var(--text-secondary); font-style: italic; }

	/* Landing Hero */
    .landing-hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 75vh;
        text-align: center;
    }

    .landing-hero h1 {
        font-size: 4rem;
        margin-bottom: 1rem;
        color: var(--text-primary);
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
        font-weight: 900;
        background: none;
        -webkit-text-fill-color: initial;
    }

    .landing-hero .subtitle {
        font-size: 1.5rem;
        color: var(--text-secondary);
        margin-bottom: 3rem;
        font-family: "Inter", "Noto Sans KR", sans-serif;
        font-weight: 300;
    }

    .login-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
    }

    .google-login-btn {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem 2rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-primary);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: var(--shadow);
    }

    .google-login-btn:hover {
        background: var(--btn-secondary);
        transform: translateY(-1px);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .login-hint { font-size: 0.9rem; color: var(--text-secondary); font-style: italic; }
    .btn-signup-large { background: var(--color-success-text); margin-bottom: 1rem; }
</style>
