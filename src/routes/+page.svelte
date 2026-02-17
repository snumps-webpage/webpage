<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
    	import { signIn } from '@auth/sveltekit/client';
        import { goto } from '$app/navigation';
    	import Skeleton from '$lib/components/Skeleton.svelte';
        import type { DashboardData, Activity } from '$lib/types';
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
        let dashboardData = $state<DashboardData | null>(null);
    
        // Resolve stream once
        $effect(() => {
            data.streamed.dashboard.then(result => {
                if (result && !('error' in result)) {
                    dashboardData = result as DashboardData;
                }
            });
        });
    
        // Purely synchronous filtering - FAST
	        let filteredActivities = $derived(
	            dashboardData 
	                ? dashboardData.activities.filter((a: Activity) => 
	                    (selectedSemester === 'all' || a.semester === selectedSemester) &&
	                    (attendanceFilter === 'all' || (attendanceFilter === 'attended' ? a.attended : !a.attended)) &&
	                    (typeFilter === 'all' || a.type === typeFilter)
	                )
	                : []
	        );
		const figureGlyphByTitle: Record<string, string> = {
			'세미나 관리': '∫',
			'회원 정보 관리': '∂'
		};

		const figureIndexByTitle: Record<string, string> = {
			'세미나 관리': 'Figure 1',
			'회원 정보 관리': 'Figure 2'
		};

		function getFigureGlyph(title: string) {
			return figureGlyphByTitle[title] ?? '∎';
		}

		function getFigureIndex(title: string) {
			return figureIndexByTitle[title] ?? 'Figure';
		}
    async function refreshDashboard() {
        if (isRefreshing) return;
        isRefreshing = true;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('refresh', Date.now().toString());
            await goto(url.toString(), { replaceState: true, invalidateAll: true });
            
            // Silently remove the refresh parameter from the URL bar
            const cleanUrl = new URL(window.location.href);
            if (cleanUrl.searchParams.has('refresh')) {
                cleanUrl.searchParams.delete('refresh');
                window.history.replaceState(window.history.state, '', cleanUrl.toString());
            }
        } finally {
            isRefreshing = false;
        }
    }
</script>

{#snippet collapsibleCard(title: string, bindValue: boolean, toggle: () => void, children: import('svelte').Snippet)}
	<figure class="card figure-block {bindValue ? '' : 'collapsed'}">
		<figcaption class="figure-caption no-sel">
			<span class="figure-label">{getFigureIndex(title)}</span>
			<span class="figure-glyph" aria-hidden="true">{getFigureGlyph(title)}</span>
			<span class="figure-title">{title}</span>
		</figcaption>
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
	</figure>
{/snippet}

<div class="container" class:manuscript={!!session?.user}>
	{#if session?.user}
        {#if isMember || isAdmin}
            <div class="dashboard-header">
				<div class="header-title-group">
					<p class="section-marker no-sel">Issue {data.semester}</p>
                	<h1 class="no-sel">활동 현황</h1>
				</div>
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
                    <figure class="card mb-4 skeleton-figure"><Skeleton width="100%" height="150px" /></figure>
                    <figure class="card mb-4 skeleton-figure"><Skeleton width="100%" height="150px" /></figure>
                    <figure class="card mb-4 skeleton-figure"><Skeleton width="100%" height="150px" /></figure>
                </div>
            {:then result}
                {#if result && 'error' in result}
                    <div class="dashboard-grid">
                        <figure class="card stats-card error-state figure-block">
							<figcaption class="figure-caption no-sel">
								<span class="figure-label">Figure ε</span>
								<span class="figure-glyph" aria-hidden="true">⊥</span>
								<span class="figure-title">데이터 연결 상태</span>
							</figcaption>
                            <h2>연결 실패</h2>
                            <div class="error-content">
                                <span class="error-icon">⚠️</span>
                                <p class="error-msg">{result.error}</p>
                                <p class="retry-hint">서버와의 통신이 원활하지 않습니다.<br>잠시 후 우측 상단의 '새로고침' 버튼을 눌러주세요.</p>
                            </div>
                        </figure>
                        
                        <!-- Empty slots for layout continuity -->
                        <figure class="card collapsed disabled figure-block">
							<figcaption class="figure-caption no-sel">
								<span class="figure-label">Figure 2</span>
								<span class="figure-glyph" aria-hidden="true">∂</span>
								<span class="figure-title">회원 정보 관리</span>
							</figcaption>
                            <div class="card-header-toggle" role="presentation">
                                <h2>회원 정보 관리</h2>
                                <span class="chevron">-</span>
                            </div>
                        </figure>

                        <figure class="card collapsed disabled figure-block">
							<figcaption class="figure-caption no-sel">
								<span class="figure-label">Figure 1</span>
								<span class="figure-glyph" aria-hidden="true">∫</span>
								<span class="figure-title">세미나 관리</span>
							</figcaption>
                            <div class="card-header-toggle" role="presentation">
                                <h2>세미나 관리</h2>
                                <span class="chevron">-</span>
                            </div>
                        </figure>
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
                                                        {#if req.status === 'pending'}
                                                            <a href="/seminar/edit/{req.id}" class="btn-edit-inline">신청 정보 수정</a>
                                                        {/if}
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
																<label for="phone" class="no-sel">전화번호</label>
                                                                <input 
                                                                    type="tel" 
                                                                    id="phone" 
                                                                    name="phone" 
                                                                    value={result.profile.phone} 
                                                                    placeholder="010-1234-5678" 
                                                                    pattern="[0-9]{3}-[0-9]{4}-[0-9]{4}"
                                                                    title="XXX-XXXX-XXXX 형식으로 입력해주세요."
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
                        <figure class="stats-card no-sel figure-block">
							<figcaption class="figure-caption">
								<span class="figure-label">Figure 3</span>
								<span class="figure-glyph" aria-hidden="true">Σ</span>
								<span class="figure-title">출석 통계</span>
							</figcaption>
                            <h2>{data.semester} 출석 현황</h2>
                            <div class="stats-grid">
                                <div class="stats-text">
                                    <div class="stat-item">
                                        <span class="stat-value">{result.myAttendanceStats.attended}</span>
                                        <span class="stat-label">출석</span>
                                    </div>
                                    <div class="stat-divider">/</div>
                                    <div class="stat-item">
                                        <span class="stat-value total">{result.myAttendanceStats.total}</span>
                                        <span class="stat-label">전체 활동</span>
                                    </div>
                                </div>
                                <div class="stat-chart">
                                    {#if result.myAttendanceStats.total > 0}
                                        <div class="pie-chart" style="--percent: {(result.myAttendanceStats.attended / result.myAttendanceStats.total) * 100}%"></div>
                                    {/if}
                                </div>
                            </div>
                        </figure>
                    </div>

                    <!-- 4. Activities List (Responsive View) -->
                    <figure class="activities-list figure-block">
						<figcaption class="figure-caption">
							<span class="figure-label">Figure 4</span>
							<span class="figure-glyph" aria-hidden="true">∀</span>
							<span class="figure-title">활동 목록</span>
						</figcaption>
                        <div class="list-header">
                            <h3 class="no-sel">활동 목록</h3>
                            <div class="filters">
                                <select bind:value={typeFilter} class="semester-select">
                                    <option value="all">전체 종류</option>
                                    {#each Array.from(new Set(result.activities.map((a: Activity) => a.type))) as type (type)}
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
                            <!-- Desktop View -->
                            <div class="table-container desktop-only">
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

                            <!-- Mobile View: Activity Cards -->
                            <div class="mobile-activity-list mobile-only">
                                {#each filteredActivities as activity (activity.id)}
                                    <figure class="activity-card {activity.attended ? 'attended' : 'absent'}">
										<figcaption class="activity-caption">
											<span aria-hidden="true">{activity.attended ? '✓' : '∅'}</span>
											<span>{activity.type}</span>
										</figcaption>
                                        <div class="activity-head">
                                            <span class="date">{activity.date}</span>
                                            {#if activity.attended}
                                                <span class="badge success">출석</span>
                                            {:else}
                                                <span class="badge fail">결석</span>
                                            {/if}
                                        </div>
                                        <div class="activity-body">
                                            <a href={activity.url} target="_blank" rel="noopener noreferrer" class="activity-name">
                                                {activity.name}
                                            </a>
                                            <span class="tag">{activity.type}</span>
                                        </div>
                                    </figure>
                                {/each}
                            </div>
                        {/if}
                    </figure>
                {/if}
            {/await}
        {/if}
		{:else}
			<article class="guest-paper no-sel">
				<span class="paper-side-mark" aria-hidden="true">SNUMPS @ 29 NOV 2024</span>
				<div class="paper-symbol-bg" aria-hidden="true">
					<span>∫</span>
					<span>∑</span>
					<span>∂</span>
					<span>∀</span>
					<span>∃</span>
					<span>∴</span>
					<span>ℕ</span>
					<span>π</span>
					<span>∞</span>
					<span>∇</span>
					<span>⊂</span>
					<span>⇒</span>
					<span>≈</span>
					<span>⊕</span>
					<span>λ</span>
					<span>φ</span>
				</div>

				<section class="paper-page cover-page">
					<div class="cover-main">
						<div class="cover-rule thick"></div>
						<div class="cover-header-cluster">
							<div class="title-container">
								<img src={favicon} alt="SNUMPS 로고" class="paper-logo" />
								<h1 class="paper-title">
									<span class="text-break">서울대학교</span>
									<span class="text-break">수학문제연구회</span>
								</h1>
								<p class="paper-affiliation">SNUMPS</p>
							</div>
							<div class="paper-authors" aria-label="SNUMPS 운영진">
								<div class="author-entry">
									<p class="author-name">김건호<sup>*</sup></p>
									<p class="author-role">회장 / Author</p>
									<p class="author-contact">010-3472-6234</p>
								</div>
								<div class="author-entry">
									<p class="author-name">서성욱<sup>†</sup></p>
									<p class="author-role">부회장 / Co-author</p>
									<p class="author-contact">010-2865-4851</p>
								</div>
							</div>
						</div>
						<div class="cover-rule thin"></div>

						<div class="login-container">
							<button class="google-login-btn" onclick={() => signIn('google')}>
								<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
									<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
									<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
									<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
									<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
								</svg>
								<span>서울대학교 구글 계정으로 로그인</span>
							</button>
							<p class="login-hint">@snu.ac.kr 계정만 이용 가능합니다.</p>
						</div>

						<p class="scroll-hint">아래로 넘겨 초록 보기</p>
					</div>
					<p class="author-note cover-footnote">* Chair &nbsp;&nbsp; † Vice Chair</p>
				</section>

				<section class="paper-page abstract-page">
					<h2 class="abstract-title">Abstract</h2>
					<p class="abstract-body">
						SNUMPS는 수학을 좋아하는 사람들이 모여 자유롭게 생각을 나누고, 함께 배우는 모임입니다.
						단순히 문제를 풀고 끝나는 것이 아니라, 직접 문제를 만들어보거나 풀이 과정을 공유하면서 새로운 시각을 발견하는 활동을 합니다.
						이를 통해 수학의 다양한 주제를 탐구하며 서로 배우고 성장하는 것을 목표로 하는 동아리입니다.
						또한 유튜브와 인스타그램에서도 활동 소식과 기록을 꾸준히 공유하고 있습니다.<sup class="inline-ref">[1, 2]</sup>
					</p>
					<div class="abstract-links">
						<p class="abstract-links-title">Footnotes</p>
						<p class="abstract-link-item">
							<span class="ref-index">[1]</span>
							<a
								href="https://www.instagram.com/snu_mps?igsh=MXB5MWNodXg2c20yeQ%3D%3D&utm_source=qr"
								target="_blank"
								rel="noopener noreferrer"
							>&#92;url(instagram.com/snu_mps)</a>
						</p>
						<p class="abstract-link-item">
							<span class="ref-index">[2]</span>
							<a
								href="http://www.youtube.com/@snu_mps"
								target="_blank"
								rel="noopener noreferrer"
							>&#92;url(youtube.com/@snu_mps)</a>
						</p>
					</div>
				</section>
			</article>
		{/if}
	</div>

<style>
	.container {
		width: 100%;
	}

	.container.manuscript {
		max-width: 980px;
		margin: 0 auto;
		padding: clamp(1.25rem, 2.4vw, 2.7rem);
		width: 100%;
		position: relative;
	}

	.container.manuscript::before,
	.container.manuscript::after {
		position: absolute;
		top: 2.2rem;
		font-family: var(--font-math, var(--font-display));
		font-size: 1.25rem;
		color: rgba(95, 100, 109, 0.6);
	}

	.container.manuscript::before {
		content: "∫";
		left: -0.4rem;
	}

	.container.manuscript::after {
		content: "∑";
		right: -0.4rem;
	}

	.dashboard-header {
		margin-bottom: 1.6rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem;
		position: relative;
		animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.dashboard-header::after {
		content: "";
		position: absolute;
		left: 0;
		bottom: -1px;
		width: 7rem;
		border-bottom: 2px solid var(--text-primary);
	}

	.section-marker {
		margin: 0 0 0.25rem;
		font-size: 0.72rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.16em;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.9rem, 2.9vw, 2.5rem);
		font-weight: 560;
		line-height: 1.15;
	}

	.refresh-dashboard-btn {
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.45rem 0.85rem;
		cursor: pointer;
		font-size: 0.74rem;
		color: var(--text-primary);
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-weight: 600;
		transition: background 0.2s, color 0.2s;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.refresh-dashboard-btn:hover:not(:disabled) {
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	.refresh-dashboard-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dashboard-skeleton {
		display: grid;
		gap: 1rem;
	}

	.mb-4 {
		margin: 0;
	}

	.dashboard-grid {
		display: grid;
		gap: 1.4rem;
	}

	.card,
	.stats-card,
	.activities-list,
	.activity-card {
		margin: 0;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		position: relative;
		overflow: hidden;
		box-shadow: 0 8px 20px -16px rgba(28, 32, 36, 0.35);
		animation: slide-up-fade 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	:global(.dark) .card,
	:global(.dark) .stats-card,
	:global(.dark) .activities-list,
	:global(.dark) .activity-card {
		box-shadow: 0 16px 28px -20px rgba(0, 0, 0, 0.85);
	}

	.dashboard-grid > :nth-child(1) {
		animation-delay: 0.06s;
	}

	.dashboard-grid > :nth-child(2) {
		animation-delay: 0.12s;
	}

	.dashboard-grid > :nth-child(3) {
		animation-delay: 0.18s;
	}

	.figure-block {
		border-left: 3px solid var(--text-primary);
	}

	.figure-caption {
		padding: 0.5rem 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border-bottom: 1px solid var(--border-color);
		background: linear-gradient(90deg, rgba(0, 0, 0, 0.035), transparent);
	}

	:global(.dark) .figure-caption {
		background: linear-gradient(90deg, rgba(255, 255, 255, 0.06), transparent);
	}

	.figure-label {
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.figure-glyph {
		font-family: var(--font-math, var(--font-display));
		font-size: 1rem;
		line-height: 1;
		color: var(--text-primary);
	}

	.figure-title {
		font-size: 0.82rem;
		color: var(--text-secondary);
		font-style: italic;
	}

	.card-header-toggle {
		width: 100%;
		border: none;
		border-bottom: 1px solid var(--border-color);
		padding: 1rem 1.35rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: transparent;
		text-align: left;
	}

	button.card-header-toggle {
		cursor: pointer;
		transition: background 0.2s;
	}

	button.card-header-toggle:hover {
		background: rgba(31, 39, 48, 0.06);
	}

	:global(.dark) button.card-header-toggle:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.card-header-toggle h2 {
		margin: 0;
		font-size: 1.12rem;
		font-style: italic;
		font-weight: 560;
	}

	.chevron {
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-family: var(--font-mono);
	}

	.card.collapsed .card-header-toggle {
		border-bottom: none;
	}

	.card.disabled {
		opacity: 0.67;
	}

	.card-content {
		padding: 1.2rem 1.35rem 1.4rem;
	}

	.profile-summary {
		display: grid;
		gap: 1.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		font-size: 0.67rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.form-group input,
	.form-group textarea,
	.edit-input,
	.edit-textarea {
		width: 100%;
		padding: 0.75rem 0.8rem;
		border: 1px solid var(--border-color);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 0.95rem;
		font-family: var(--font-body);
		line-height: 1.5;
		resize: none;
	}

	.form-group input:focus,
	.form-group textarea:focus,
	.edit-input:focus,
	.edit-textarea:focus {
		outline: none;
		border-color: var(--text-primary);
	}

	.btn-save,
	.btn-apply,
	.btn-confirm,
	.btn-cancel {
		border: 1px solid var(--text-primary);
		background: var(--text-primary);
		color: var(--bg-primary);
		padding: 0.62rem 0.9rem;
		font-size: 0.72rem;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.11em;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s, color 0.2s;
	}

	.btn-save:hover,
	.btn-apply:hover,
	.btn-confirm:hover,
	.btn-cancel:hover {
		background: transparent;
		color: var(--text-primary);
	}

	.seminar-section {
		display: grid;
		gap: 1rem;
	}

	.seminar-list {
		display: grid;
		gap: 0.9rem;
	}

	.seminar-item {
		padding: 1rem;
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-left: 3px solid var(--text-secondary);
	}

	.seminar-item.approved {
		border-left-color: var(--text-primary);
	}

	.seminar-item.request.pending {
		border-left-color: var(--color-warning-text);
	}

	.seminar-item.request.approved {
		border-left-color: var(--color-success-text);
	}

	.seminar-item.request.rejected {
		border-left-color: var(--color-danger-text);
	}

	.seminar-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.sem-tag {
		font-size: 0.62rem;
		font-weight: 600;
		text-transform: uppercase;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		padding: 0.2rem 0.45rem;
		margin-bottom: 0.62rem;
		font-family: var(--font-mono);
		letter-spacing: 0.1em;
	}

	.sem-title {
		display: block;
		font-weight: 560;
		color: var(--text-primary);
		margin-bottom: 0.2rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
	}

	.sem-meta {
		font-size: 0.92rem;
		color: var(--text-secondary);
		font-family: var(--font-body);
		font-style: italic;
	}

	.view-mode {
		display: grid;
		gap: 0.15rem;
	}

	.edit-form {
		display: grid;
		gap: 0.75rem;
		margin-top: 0.55rem;
		width: 100%;
	}

	.edit-actions {
		display: flex;
		gap: 0.55rem;
	}

	.btn-edit-inline {
		margin-top: 0.7rem;
		padding: 0.38rem 0.7rem;
		font-size: 0.68rem;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		background: transparent;
		cursor: pointer;
		font-family: var(--font-mono);
		text-transform: uppercase;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		letter-spacing: 0.07em;
	}

	.btn-edit-inline::before {
		content: "✎";
		font-size: 0.8rem;
	}

	.btn-edit-inline:hover {
		color: var(--text-primary);
		border-color: var(--text-primary);
	}

	.empty-hint,
	.empty-state {
		margin: 0;
		padding: 2.2rem 1rem;
		text-align: center;
		color: var(--text-secondary);
		font-style: italic;
	}

	.stats-card h2 {
		margin: 1rem 1.35rem 0;
		font-size: 1.2rem;
		font-style: italic;
		font-weight: 560;
	}

	.stats-grid {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.8rem;
		padding: 1.1rem 1.35rem 1.4rem;
	}

	.stats-text {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value {
		font-size: 2.8rem;
		font-weight: 550;
		font-family: var(--font-display);
		line-height: 1;
	}

	.stat-value.total {
		color: var(--text-secondary);
		opacity: 0.48;
	}

	.stat-label {
		font-size: 0.66rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		margin-top: 0.48rem;
		font-family: var(--font-mono);
		font-weight: 700;
	}

	.stat-divider {
		font-size: 2.4rem;
		color: var(--border-color);
		font-family: var(--font-math, var(--font-display));
	}

	.pie-chart {
		width: 82px;
		height: 82px;
		border-radius: 50%;
		background: conic-gradient(var(--text-primary) var(--percent), var(--border-color) 0);
		border: 1px solid var(--border-color);
	}

	.error-state h2 {
		margin: 1rem 1.35rem 0;
		font-size: 1.12rem;
	}

	.error-content {
		padding: 0.95rem 1.35rem 1.3rem;
		display: grid;
		gap: 0.4rem;
	}

	.error-icon {
		font-size: 1.2rem;
	}

	.error-msg {
		margin: 0;
		font-weight: 600;
		color: var(--color-danger-text);
	}

	.retry-hint {
		margin: 0;
		color: var(--text-secondary);
		font-style: italic;
		font-size: 0.93rem;
	}

	.activities-list {
		margin-top: 1.65rem;
		padding-bottom: 1.2rem;
		animation: slide-up-fade 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.35rem;
		border-bottom: 1px solid var(--border-color);
	}

	.activities-list h3 {
		font-size: 1.35rem;
		margin: 0;
		font-style: italic;
	}

	.filters {
		display: flex;
		gap: 0.55rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.semester-select {
		padding: 0.44rem 0.68rem;
		border: 1px solid var(--border-color);
		font-size: 0.72rem;
		background: var(--bg-primary);
		color: var(--text-primary);
		cursor: pointer;
		font-family: var(--font-mono);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.table-container {
		margin: 0 1.35rem 0.75rem;
		background: var(--bg-primary);
		overflow: hidden;
		border: 1px solid var(--border-color);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}

	th {
		padding: 0.78rem 0.9rem;
		font-size: 0.66rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.11em;
		border-bottom: 1px solid var(--border-color);
		font-family: var(--font-mono);
	}

	td {
		padding: 0.92rem 0.9rem;
		border-bottom: 1px solid var(--border-color);
		font-size: 0.97rem;
	}

	tr:last-child td {
		border-bottom: none;
	}

	tr:hover td {
		background: rgba(31, 39, 48, 0.045);
	}

	:global(.dark) tr:hover td {
		background: rgba(255, 255, 255, 0.03);
	}

	.date {
		white-space: nowrap;
		color: var(--text-secondary);
		font-size: 0.79rem;
		font-family: var(--font-mono);
	}

	.activity-link {
		color: var(--text-primary);
		text-decoration: none;
		border-bottom: 1px solid var(--border-color);
		font-weight: 530;
		font-family: var(--font-display);
		font-style: italic;
		transition: border-color 0.2s;
	}

	.activity-link:hover {
		border-bottom-color: var(--text-primary);
	}

	.tag {
		display: inline-block;
		padding: 0.22rem 0.46rem;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		font-size: 0.62rem;
		white-space: nowrap;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.badge {
		display: inline-block;
		padding: 0.22rem 0.56rem;
		font-size: 0.64rem;
		font-weight: 700;
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: var(--font-mono);
	}

	.badge.success {
		background: var(--color-success-bg);
		color: var(--color-success-text);
	}

	.badge.fail {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
	}

	.mobile-activity-list {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 0 1rem 0.8rem;
	}

	.activity-card {
		padding: 0;
	}

	.activity-caption {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.43rem 0.7rem;
		border-bottom: 1px solid var(--border-color);
		font-size: 0.7rem;
		font-family: var(--font-mono);
		color: var(--text-secondary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.activity-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 0.8rem 0.6rem;
	}

	.activity-body {
		display: flex;
		flex-direction: column;
		gap: 0.42rem;
		padding: 0 0.8rem 0.86rem;
	}

	.activity-name {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--text-primary);
		text-decoration: none;
		font-size: 1.03rem;
		font-weight: 560;
	}

	.desktop-only {
		display: block;
	}

	.mobile-only {
		display: none;
	}

	.guest-paper {
		max-width: 980px;
		margin: 0 auto;
		--side-mark-gutter: 1.24rem;
		padding: 0 var(--side-mark-gutter);
		color: var(--latex-text, var(--text-primary));
		position: relative;
		isolation: isolate;
	}

	.guest-paper::before {
		content: "";
		position: fixed;
		inset: var(--nav-height) 0 0 0;
		pointer-events: none;
		background-image:
			radial-gradient(rgba(0, 0, 0, 0.075) 0.45px, transparent 0.45px);
		background-size: 2.8px 2.8px;
		opacity: 0.09;
		z-index: 0;
	}

	.paper-side-mark {
		position: fixed;
		left: max(0.06rem, env(safe-area-inset-left));
		top: calc(var(--nav-height) + env(safe-area-inset-top) + 0.32rem);
		bottom: calc(3.15rem + env(safe-area-inset-bottom));
		display: flex;
		align-items: center;
		justify-content: center;
		transform: rotate(180deg);
		writing-mode: vertical-rl;
		font-family: var(--font-display);
		font-size: clamp(0.94rem, 1.35vw, 1.22rem);
		letter-spacing: 0.08em;
		color: var(--latex-side-mark);
		pointer-events: none;
		z-index: 65;
	}

		.paper-symbol-bg {
			position: fixed;
			inset:
				calc(var(--nav-height) + env(safe-area-inset-top) + 0.3rem)
				0
				calc(3.15rem + env(safe-area-inset-bottom))
				var(--side-mark-gutter);
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			align-content: space-evenly;
			justify-items: center;
			row-gap: clamp(0.8rem, 2.8vh, 2rem);
			pointer-events: none;
			color: var(--latex-side-mark);
			opacity: 0.29;
			z-index: 1;
		}

		.paper-symbol-bg span {
			font-family: var(--font-math, var(--font-display));
			font-size: clamp(1.2rem, 2.35vw, 1.86rem);
			line-height: 1;
		}

		.paper-symbol-bg span:nth-child(odd) {
			transform: translateY(-0.16rem);
		}

		.paper-symbol-bg span:nth-child(4n) {
			transform: translateY(0.24rem);
		}

		.paper-symbol-bg span:nth-child(5n) {
			transform: translateY(0.08rem);
		}

	.paper-page {
		min-height: calc(100vh - var(--nav-height));
		min-height: calc(100dvh - var(--nav-height));
		scroll-snap-align: start;
		scroll-snap-stop: always;
		display: flex;
		flex-direction: column;
		justify-content: center;
		position: relative;
		z-index: 2;
		padding-left: clamp(0.55rem, 1.25vw, 1rem);
		padding-right: clamp(0.55rem, 1.25vw, 1rem);
	}

	.paper-page::before,
	.paper-page::after {
		content: "";
		position: absolute;
		width: 1.2rem;
		height: 1.2rem;
		pointer-events: none;
		opacity: 0.45;
	}

	.paper-page::before {
		top: clamp(1rem, 3.1vw, 1.6rem);
		left: 0;
		border-top: 1px solid var(--latex-rule, var(--border-color));
		border-left: 1px solid var(--latex-rule, var(--border-color));
	}

	.paper-page::after {
		right: 0;
		bottom: clamp(1rem, 3.1vw, 1.6rem);
		border-right: 1px solid var(--latex-rule, var(--border-color));
		border-bottom: 1px solid var(--latex-rule, var(--border-color));
	}

	.cover-page {
		padding: clamp(1.4rem, 3vw, 2.2rem) 0;
		justify-content: flex-start;
		--cover-center-width: 66rem;
	}

	.cover-main {
		flex: 1;
		width: min(100%, var(--cover-center-width));
		margin-inline: auto;
		display: grid;
		align-content: center;
	}

	.cover-header-cluster {
		margin-top: clamp(0.42rem, 1.1vh, 0.8rem);
		margin-bottom: clamp(0.35rem, 1.2vh, 0.95rem);
		width: 100%;
		display: grid;
		justify-items: center;
	}

	.abstract-page {
		padding: clamp(1.7rem, 3.5vw, 2.5rem) 0;
		align-items: center;
	}

	.cover-rule {
		width: 100%;
	}

	.cover-rule.thick {
		border-top: 2px solid var(--latex-rule, var(--text-primary));
		margin-top: clamp(0.36rem, 0.9vh, 0.7rem);
	}

	.cover-rule.thin {
		border-top: 1px solid var(--latex-rule, var(--border-color));
		margin-top: 0.92rem;
	}

	.title-container {
		margin-top: 0.68rem;
		width: 100%;
		display: grid;
		justify-items: center;
		gap: 0.28rem;
	}

	.paper-logo {
		width: clamp(4.6rem, 10vw, 6.8rem);
		height: auto;
		opacity: 0.88;
		filter: grayscale(1) contrast(0.9);
	}

	.paper-title {
		margin: 0.34rem 0 0.18rem;
		font-size: clamp(1.88rem, 4.1vw, 2.45rem);
		line-height: 1.2;
		text-align: center;
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--latex-text, var(--text-primary));
	}

	.paper-title .text-break {
		display: inline;
	}

	.paper-affiliation {
		margin: 0;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--latex-muted, var(--text-secondary));
	}

	.paper-authors {
		margin: 0.82rem auto 0.45rem;
		max-width: 34rem;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: 0.9rem;
		row-gap: 0.6rem;
	}

	.author-entry {
		text-align: center;
	}

	.author-name {
		margin: 0;
		font-size: 1.02rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--latex-text, var(--text-primary));
	}

	.author-name sup {
		font-size: 0.62em;
		top: -0.35em;
		position: relative;
	}

	.author-role {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--latex-muted, var(--text-secondary));
	}

	.author-contact {
		margin: 0.18rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.03em;
		color: var(--latex-text, var(--text-primary));
	}

	.author-note {
		margin: 0;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--latex-muted, var(--text-secondary));
	}

	.cover-footnote {
		margin-top: 0.8rem;
		padding-top: 0.75rem;
		width: min(100%, var(--cover-center-width));
		margin-inline: auto;
		border-top: 1px dotted var(--latex-rule, var(--border-color));
	}

	.login-container {
		display: grid;
		justify-items: center;
		gap: 0.52rem;
		margin-top: 1.6rem;
	}

	.google-login-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.8rem 1.2rem;
		background: transparent;
		border: 1px solid var(--latex-rule, var(--border-color));
		color: var(--latex-text, var(--text-primary));
		font-weight: 600;
		cursor: pointer;
		transition: background 0.16s, color 0.16s;
		font-family: var(--font-mono);
		font-size: clamp(0.75rem, 2.1vw, 0.86rem);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		width: 100%;
		max-width: 440px;
		border-radius: 0;
	}

	.google-login-btn span {
		white-space: nowrap;
	}

	.google-login-btn:hover {
		background: var(--latex-text, var(--text-primary));
		color: var(--latex-bg, var(--bg-primary));
	}

	.login-hint {
		margin: 0;
		font-size: 0.71rem;
		font-family: var(--font-mono);
		color: var(--latex-muted, var(--text-secondary));
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.scroll-hint {
		margin: 1.2rem 0 0;
		text-align: center;
		font-size: 0.69rem;
		font-family: var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--latex-muted, var(--text-secondary));
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.26rem;
	}

	.scroll-hint::before {
		content: "↓";
		opacity: 0.7;
		animation: hint-bob 1.6s ease-in-out infinite;
	}

	.abstract-title {
		margin: 0;
		padding-top: 0.5rem;
		border-top: 1px solid var(--latex-rule, var(--border-color));
		font-size: clamp(1.42rem, 3vw, 1.9rem);
		font-weight: 600;
		text-align: center;
		color: var(--latex-text, var(--text-primary));
		width: min(100%, 46rem);
	}

	.abstract-body {
		margin: 1.05rem 0 0;
		font-size: clamp(0.96rem, 1.65vw, 1.04rem);
		line-height: 1.78;
		text-align: justify;
		text-indent: 1.5em;
		color: var(--latex-text, var(--text-primary));
		width: min(100%, 46rem);
	}

	.inline-ref {
		font-size: 0.72em;
		letter-spacing: 0.03em;
		color: var(--latex-muted, var(--text-secondary));
	}

	.abstract-links {
		margin: 1.12rem 0 0;
		padding-top: 0.72rem;
		border-top: 1px solid var(--latex-rule, var(--border-color));
		width: min(100%, 46rem);
	}

	.abstract-links-title {
		margin: 0 0 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--latex-muted, var(--text-secondary));
	}

	.abstract-link-item {
		margin: 0.12rem 0;
		display: flex;
		align-items: baseline;
		gap: 0.38rem;
		font-family: var(--font-mono);
		font-size: 0.77rem;
		color: var(--latex-text, var(--text-primary));
	}

	.ref-index {
		color: var(--latex-muted, var(--text-secondary));
		flex: 0 0 auto;
	}

	.abstract-link-item a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px dotted var(--latex-rule, var(--border-color));
		word-break: break-all;
	}

	.abstract-link-item a:hover {
		background: var(--latex-text, var(--text-primary));
		color: var(--latex-bg, var(--bg-primary));
	}

	@media (max-width: 900px) {
		.container.manuscript::before,
		.container.manuscript::after {
			display: none;
		}

		.dashboard-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.list-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.85rem;
		}

		.filters {
			width: 100%;
			justify-content: flex-start;
		}

		.guest-paper {
			--side-mark-gutter: 1.06rem;
			padding: 0 var(--side-mark-gutter);
		}

		.guest-paper::before {
			opacity: 0.06;
		}

		.paper-side-mark {
			left: max(0.04rem, env(safe-area-inset-left));
			top: calc(var(--nav-height) + env(safe-area-inset-top) + 0.25rem);
			bottom: calc(2.95rem + env(safe-area-inset-bottom));
			font-size: 0.98rem;
			letter-spacing: 0.06em;
			opacity: 0.95;
		}

		.paper-symbol-bg {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			opacity: 0.24;
			row-gap: 1.15rem;
		}

		.paper-symbol-bg span {
			font-size: 1.3rem;
		}

		.paper-symbol-bg span:nth-child(n + 13) {
			display: none;
		}

		.paper-authors {
			max-width: 27rem;
			column-gap: 0.55rem;
		}

		.paper-logo {
			width: 4.9rem;
		}

		.author-name {
			font-size: 0.96rem;
		}

		.author-contact {
			font-size: 0.74rem;
		}

		.paper-page {
			padding-left: 0.5rem;
			padding-right: 0.5rem;
		}

		.paper-page::before,
		.paper-page::after {
			width: 0.95rem;
			height: 0.95rem;
			opacity: 0.35;
		}

		.google-login-btn {
			gap: 0.55rem;
			padding: 0.76rem 0.8rem;
			letter-spacing: 0.04em;
		}

		.google-login-btn span {
			white-space: normal;
			text-wrap: balance;
			text-align: center;
			line-height: 1.34;
		}

		.login-hint {
			text-align: center;
			letter-spacing: 0.04em;
		}

		.abstract-body {
			text-align: left;
			text-indent: 0;
			width: min(100%, 38rem);
		}

		.abstract-link-item {
			font-size: 0.73rem;
		}

		.abstract-title,
		.abstract-links {
			width: min(100%, 38rem);
		}
	}

	@media (max-width: 768px) {
		.container.manuscript {
			padding: 1rem 0.8rem 1.4rem;
		}

		.desktop-only {
			display: none;
		}

		.mobile-only {
			display: block;
		}

		.stats-grid {
			flex-direction: column;
			text-align: center;
		}

		.stats-text {
			justify-content: center;
		}

		.stat-chart {
			margin: 0;
		}

		.semester-select {
			min-width: 9.2rem;
			flex: 1;
		}

		.paper-page {
			min-height: calc(100svh - var(--nav-height) - 0.35rem);
			scroll-snap-stop: normal;
		}

		.paper-side-mark {
			left: max(0.02rem, env(safe-area-inset-left));
			bottom: calc(2.8rem + env(safe-area-inset-bottom));
			font-size: 0.92rem;
		}

		.paper-symbol-bg {
			opacity: 0.2;
		}

		.cover-page {
			padding: 1.15rem 0;
		}

		.cover-header-cluster {
			margin-bottom: 0.58rem;
		}

		.abstract-page {
			justify-content: flex-start;
			align-items: center;
			min-height: auto;
			padding: 1.7rem 0 1.25rem;
		}
	}

	@media (max-width: 620px) {
		.guest-paper {
			--side-mark-gutter: 0.96rem;
			padding: 0 var(--side-mark-gutter);
		}

		.paper-side-mark {
			display: block;
			left: max(0.01rem, env(safe-area-inset-left));
			bottom: calc(2.7rem + env(safe-area-inset-bottom));
			font-size: 0.86rem;
			letter-spacing: 0.05em;
			opacity: 0.92;
		}

		.paper-symbol-bg {
			opacity: 0.17;
			row-gap: 0.8rem;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.paper-symbol-bg span {
			font-size: 1.24rem;
		}

		.paper-symbol-bg span:nth-child(n + 9) {
			display: none;
		}

		.paper-authors {
			grid-template-columns: 1fr;
			max-width: 100%;
			row-gap: 0.46rem;
			margin-top: 0.72rem;
		}

		.author-entry {
			padding: 0.2rem 0;
		}

		.author-role {
			font-size: 0.62rem;
		}

		.author-contact {
			font-size: 0.72rem;
		}

		.paper-title .text-break {
			display: block;
		}

		.paper-title {
			font-size: 1.78rem;
			line-height: 1.16;
		}

		.cover-header-cluster {
			margin-bottom: 0.48rem;
		}

		.paper-logo {
			width: 3.8rem;
		}

		.google-login-btn {
			padding: 0.76rem 0.84rem;
			max-width: 100%;
		}

		.abstract-body {
			font-size: 0.94rem;
			line-height: 1.7;
			margin-top: 0.88rem;
			width: min(100%, 30rem);
		}

		.abstract-links-title {
			font-size: 0.62rem;
		}

		.abstract-title,
		.abstract-links {
			width: min(100%, 30rem);
		}

		.paper-page::before,
		.paper-page::after {
			display: none;
		}

		.cover-footnote {
			padding-top: 0.62rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.scroll-hint::before {
			animation: none;
		}
	}

	@keyframes hint-bob {
		0%, 100% { transform: translateY(0); opacity: 0.58; }
		50% { transform: translateY(2px); opacity: 1; }
	}

	@keyframes slide-up-fade {
		from {
			opacity: 0;
			transform: translateY(18px);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
