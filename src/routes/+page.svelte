<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
    	import { signIn } from '@auth/sveltekit/client';
        import { goto } from '$app/navigation';
    		import Skeleton from '$lib/components/Skeleton.svelte';
    		import SymbolBackground from '$lib/components/SymbolBackground.svelte';
    		import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    		import { MANUSCRIPT } from '$lib/constants';
    		import type { DashboardData, Activity } from '$lib/types';    	import type { PageData } from './$types';
    
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
		const activityColumnCount = 4;
    	
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

		function clampValue(value: number, min: number, max: number) {
			return Math.max(min, Math.min(max, value));
		}

	function maxLength(values: string[]) {
		return values.reduce((max, current) => Math.max(max, current.length), 0);
	}

	function getSelectWidthCh(options: string[], fallback = 10) {
		const longest = options.length > 0 ? maxLength(options) : fallback;
		return clampValue(longest + 3, 9, 16);
	}

	function getActivityTypes(activities: Activity[]) {
		return Array.from(new Set(activities.map((activity) => activity.type))).filter(
			(type): type is string => Boolean(type)
		);
	}

	function getActivityTableMetrics(activities: Activity[]) {
		if (activities.length === 0) {
			return {
				fontScale: 1,
					minWidthRem: 34,
					cellPadRem: 0.56,
					nameMaxWidthCh: 30
				};
			}

			const longestDate = maxLength(activities.map((activity) => activity.date ?? ''));
			const longestName = maxLength(activities.map((activity) => activity.name ?? ''));
			const longestType = maxLength(activities.map((activity) => activity.type ?? ''));

			const complexity =
				activityColumnCount * 4 +
				longestDate * 0.18 +
				longestName * 0.62 +
				longestType * 0.26;

			const fontScale = complexity > 42 ? 0.9 : complexity > 34 ? 0.95 : 1;
			const minWidthRem = clampValue(
				activityColumnCount * 6.1 + longestName * 0.3 + longestType * 0.22 + longestDate * 0.18,
				31,
				44
			);
			const cellPadRem = fontScale < 0.95 ? 0.42 : fontScale < 1 ? 0.48 : 0.56;
			const nameMaxWidthCh = clampValue(16 + longestName * 0.6, 20, 38);

			return { fontScale, minWidthRem, cellPadRem, nameMaxWidthCh };
		}

		const activityTableMetrics = $derived(getActivityTableMetrics(filteredActivities));

			function getAttendanceRatio(attended: number, total: number) {
				if (total <= 0) return 0;
				return Math.round((attended / total) * 100);
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

<div class="container" class:manuscript={!!session?.user}>
	{#if session?.user}
		{#if isMember || isAdmin}
			<article class="paper-document dashboard-paper">
				<div class="dashboard-header-wrapper">
					<ManuscriptHeader 
						title="활동 현황" 
						subtitle={`Issue ${data.semester}`} 
						figure={MANUSCRIPT.FIGURES.DASHBOARD}
					/>
					<button
						class="refresh-dashboard-btn"
						onclick={refreshDashboard}
						disabled={isRefreshing}
						aria-label="Refresh Dashboard"
					>
						새로고침
					</button>
				</div>

				{#await data.streamed.dashboard}
					<div class="dashboard-skeleton">
						<div class="skeleton-line"><Skeleton width="100%" height="32px" borderRadius="0" /></div>
						<div class="skeleton-line"><Skeleton width="100%" height="120px" borderRadius="0" /></div>
						<div class="skeleton-line"><Skeleton width="100%" height="190px" borderRadius="0" /></div>
					</div>
				{:then result}
					{#if result && 'error' in result}
						<p class="paper-status-note error">데이터를 불러오지 못했습니다: {result.error}</p>
						<p class="paper-form-note">잠시 후 새로고침을 눌러 다시 시도해 주세요.</p>
					{:else if result}
						<ol class="paper-sections dashboard-sections">
							<li class="paper-section">
									<details class="paper-details" bind:open={showSeminars}>
										<summary class="paper-details-summary">
											<h2 class="paper-level-2" data-number="1">세미나 관리</h2>
											<span class="toggle-hint">{showSeminars ? '[닫기]' : '[열기]'}</span>
										</summary>
										<div class="paper-details-content seminar-content">
											<a href="/seminar/apply" class="paper-btn apply-seminar-btn">새 세미나 신청</a>
										{#if result.approvedSeminars.length === 0 && result.seminarRequests.length === 0}
											<p class="paper-form-note empty-hint">참여 중인 세미나나 신청 내역이 없습니다.</p>
										{:else}
											<div class="seminar-list">
												{#each result.approvedSeminars as seminar (seminar.id)}
													<article class="seminar-item approved">
														<div class="seminar-info">
															<p class="sem-state">기록됨</p>
															{#if editingSeminarId === seminar.id}
																<form
																	method="POST"
																	action="?/updateSeminar"
																	use:enhance={() => {
																		return ({ result }) => {
																			if (result.type === 'success') editingSeminarId = null;
																		};
																	}}
																	class="edit-form"
																>
																	<input type="hidden" name="id" value={seminar.id} />
																	<label class="paper-label" for={`seminar-title-${seminar.id}`}>제목</label>
																	<input
																		id={`seminar-title-${seminar.id}`}
																		type="text"
																		name="title"
																		value={seminar.title}
																		class="edit-input"
																	/>
																	<label class="paper-label" for={`seminar-remarks-${seminar.id}`}>비고</label>
																	<textarea
																		id={`seminar-remarks-${seminar.id}`}
																		name="remarks"
																		class="edit-textarea"
																	>{seminar.remarks}</textarea>
																	<div class="edit-actions">
																		<button type="button" class="paper-btn secondary" onclick={() => (editingSeminarId = null)}>
																			취소
																		</button>
																		<button class="paper-btn primary">저장</button>
																	</div>
																</form>
															{:else}
																<div class="view-mode">
																	<p class="sem-title">{seminar.title}</p>
																	<p class="sem-meta">{seminar.semester} | {seminar.remarks || '비고 없음'}</p>
																	<button class="paper-btn secondary btn-edit-inline" onclick={() => (editingSeminarId = seminar.id)}>
																		수정
																	</button>
																</div>
															{/if}
														</div>
													</article>
												{/each}
												{#each result.seminarRequests as req (req.id)}
													<article class="seminar-item request {req.status}">
														<div class="seminar-info">
															<p class="sem-state">
																{req.status === 'approved' ? '승인됨' : req.status === 'rejected' ? '반려됨' : '승인 대기'}
															</p>
															<p class="sem-title">{req.title}</p>
															<p class="sem-meta">{new Date(req.submittedAt).toLocaleDateString()} 신청</p>
															{#if req.status === 'pending'}
																<a href="/seminar/edit/{req.id}" class="paper-btn secondary btn-edit-inline">신청 정보 수정</a>
															{/if}
														</div>
													</article>
												{/each}
											</div>
										{/if}
									</div>
								</details>
							</li>

							<li class="paper-section">
									<details class="paper-details" bind:open={showProfile}>
										<summary class="paper-details-summary">
											<h2 class="paper-level-2" data-number="2">회원 정보 관리</h2>
											<span class="toggle-hint">{showProfile ? '[닫기]' : '[열기]'}</span>
										</summary>
										<div class="paper-details-content profile-content">
										<form method="POST" action="?/updateProfile" use:enhance class="profile-form">
											<div class="profile-summary">
												<div class="paper-field">
													<label for="phone" class="paper-label no-sel">전화번호</label>
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
												<div class="paper-field">
													<label for="background" class="paper-label no-sel">배경지식</label>
													<textarea
														id="background"
														name="background"
														rows="4"
														placeholder="관심 분야 등"
													>{result.profile.background}</textarea>
												</div>
												<div class="paper-actions profile-actions">
													<button class="paper-btn primary">저장</button>
												</div>
											</div>
										</form>
									</div>
								</details>
							</li>

								<li class="paper-section">
									<h2 class="paper-level-2" data-number="3">출석 통계</h2>
									<p class="paper-bridge paper-bridge-stats">
										본 절은 <span class="xref">{data.semester}</span>의 출석 지표를 요약한다.
										출석 {result.myAttendanceStats.attended}회 / 전체 활동
										{result.myAttendanceStats.total}회(출석률
										{getAttendanceRatio(result.myAttendanceStats.attended, result.myAttendanceStats.total)}%)를
										<span class="xref">Figure 1</span>에 제시한다.
									</p>
									<figure class="paper-figure attendance-figure">
									<div class="figure-body">
										<table class="stat-table" aria-label="출석 통계">
											<tbody>
												<tr>
													<th scope="row">출석</th>
													<td>{result.myAttendanceStats.attended}</td>
													<th scope="row">전체 활동</th>
													<td>{result.myAttendanceStats.total}</td>
												</tr>
												<tr>
													<th scope="row">출석률</th>
													<td colspan="3">{getAttendanceRatio(result.myAttendanceStats.attended, result.myAttendanceStats.total)}%</td>
												</tr>
											</tbody>
										</table>
										<div class="attendance-meter" aria-hidden="true">
											<div
												class="attendance-fill"
												style="width: {getAttendanceRatio(result.myAttendanceStats.attended, result.myAttendanceStats.total)}%"
											></div>
										</div>
									</div>
										<figcaption>Figure 1: {data.semester} 출석 현황</figcaption>
									</figure>
									<div class="attendance-divider" aria-hidden="true"></div>
								</li>

								<li class="paper-section">
									<h2 class="paper-level-2" data-number="4">활동 목록</h2>
									<p class="paper-bridge paper-bridge-activities">
										<span class="xref">Table 1</span>은 <span class="xref">Figure 1</span>의 집계값을
										활동 단위로 풀어 쓴 기록이다. 날짜, 활동명, 종류, 출석 상태를 같은 형식으로 정리했으며,
										상단 필터로 조건별 비교가 가능하다.
									</p>
									<div class="filters">
										<select
											bind:value={typeFilter}
											class="semester-select"
											style={`--select-width-ch: ${getSelectWidthCh(['전체 종류', ...getActivityTypes(result.activities)], 10)};`}
										>
											<option value="all">전체 종류</option>
											{#each getActivityTypes(result.activities) as type (type)}
												<option value={type}>{type}</option>
											{/each}
										</select>
										<select
											bind:value={attendanceFilter}
											class="semester-select"
											style={`--select-width-ch: ${getSelectWidthCh(['전체 상태', '출석', '결석'], 9)};`}
										>
											<option value="all">전체 상태</option>
											<option value="attended">출석</option>
											<option value="absent">결석</option>
										</select>
										<select
											bind:value={selectedSemester}
											class="semester-select"
											style={`--select-width-ch: ${getSelectWidthCh(['전체 학기', ...result.semesters.map((sem) => `${sem}학기`)], 10)};`}
										>
											<option value="all">전체 학기</option>
											{#each result.semesters as sem (sem)}
												<option value={sem}>{sem}학기</option>
										{/each}
									</select>
								</div>

								{#if filteredActivities.length === 0}
									<p class="paper-form-note empty-hint">조건에 맞는 활동 내역이 없습니다.</p>
								{:else}
									<figure class="paper-figure table-figure">
										<div class="table-scroll">
											<table
												class="activity-table"
												style="
													--table-min-width: {activityTableMetrics.minWidthRem}rem;
													--table-cell-pad: {activityTableMetrics.cellPadRem}rem;
													--table-font-scale: {activityTableMetrics.fontScale};
													--table-name-max: {activityTableMetrics.nameMaxWidthCh}ch;
												"
											>
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
															<tr class={activity.attended ? 'is-attended' : 'is-absent'}>
																<td class="date">{activity.date}</td>
																<td>
																	<a href={activity.url} target="_blank" rel="noopener noreferrer" class="activity-link">
																	{activity.name}
																</a>
															</td>
															<td>{activity.type}</td>
															<td>
																<StatusBadge status={activity.attended ? 'attended' : 'absent'} />
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
										<figcaption>Table 1: 필터링된 활동 목록</figcaption>
									</figure>
								{/if}
							</li>
						</ol>
					{/if}
				{/await}
			</article>
		{/if}
		{:else}
			<article class="guest-paper">
				<SymbolBackground date={MANUSCRIPT.FOUNDATION_DATE} />

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
									<p class="author-name">{page.data.executives?.president?.name || "공석"}<sup>*</sup></p>
									<p class="author-role">회장</p>
									<p class="author-contact">{page.data.executives?.president?.phone || ""}</p>
								</div>
								<div class="author-entry">
									<p class="author-name">{page.data.executives?.vicePresident?.name || "공석"}<sup>†</sup></p>
									<p class="author-role">부회장</p>
									<p class="author-contact">{page.data.executives?.vicePresident?.phone || ""}</p>
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

						<div class="scroll-hint-wrapper">
							<p class="scroll-hint">Section I: Abstract</p>
							<div class="scroll-connector"></div>
						</div>
					</div>
					<p class="author-note cover-footnote">* Chair &nbsp;&nbsp; † Vice Chair</p>
				</section>

				<section class="paper-page abstract-page">
					<h2 class="abstract-title" data-glyph="∫">Abstract</h2>
					<p class="abstract-body">
						<span class="drop-cap">S</span>NUMPS는 수학을 좋아하는 사람들이 모여 자유롭게 생각을 나누고, 함께 배우는 모임입니다.
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
			max-width: 72rem;
			margin: 0 auto;
			padding: clamp(0.9rem, 2vw, 1.8rem);
			width: 100%;
			position: relative;
		}

		.dashboard-paper {
			width: min(100%, 56rem);
			background: transparent;
			border: none;
			padding: 0;
			margin: 0 auto;
		}

		.dashboard-header {
			margin-bottom: 0.8rem;
			padding-bottom: 0.7rem;
			display: flex;
			justify-content: space-between;
			align-items: flex-end;
			gap: 1rem;
		}

		.header-title-group {
			display: grid;
			gap: 0.12rem;
		}

		.refresh-dashboard-btn {
			background: transparent;
			border: 1px solid var(--text-primary);
			padding: 0.48rem 0.82rem;
			cursor: pointer;
			font-size: 0.68rem;
			color: var(--text-primary);
			display: inline-flex;
			align-items: center;
			font-family: var(--font-mono);
			font-weight: 640;
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

		.refresh-dashboard-btn:focus-visible {
			outline: 2px solid var(--latex-accent, var(--text-primary));
			outline-offset: 2px;
		}

		.dashboard-skeleton {
			display: grid;
			gap: 0.55rem;
		}

		.skeleton-line {
			padding-top: 0.36rem;
			border-top: 1px solid var(--border-color);
		}

		.dashboard-sections {
			margin-top: 0.1rem;
			gap: 0.5rem;
		}

		.dashboard-sections .paper-section {
			padding-top: 0.5rem;
			border-top: none;
		}

		.paper-details {
			padding-top: 0.08rem;
			width: 100%;
			max-width: 100%;
		}

		.paper-details-summary {
			display: grid;
			grid-template-columns: 1fr auto;
			align-items: baseline;
			gap: 0.8rem;
			cursor: pointer;
			list-style: none;
			padding: 0.08rem 0 0.28rem;
			border-bottom: 1px solid color-mix(in srgb, var(--border-color) 54%, transparent);
		}

		.paper-details-summary::-webkit-details-marker {
			display: none;
		}

		.paper-details-summary h2 {
			margin: 0;
		}

		.toggle-hint {
			font-family: var(--font-mono);
			font-size: 0.66rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-secondary);
			padding: 0.02rem 0;
		}

		.paper-details-content {
			margin-top: 0.46rem;
			display: grid;
			gap: 0.62rem;
			width: min(100%, 38rem);
			justify-items: start;
			padding-left: 0;
			border-left: none;
		}

		.dashboard-paper .paper-btn {
			padding: 0.36rem 0.58rem;
			font-size: 0.58rem;
			letter-spacing: 0.06em;
		}

		.seminar-content {
			width: 100%;
			max-width: none;
		}

		.seminar-content .apply-seminar-btn {
			width: 100%;
			justify-content: center;
			font-size: 0.66rem;
			letter-spacing: 0.075em;
		}

		.profile-content {
			width: 100%;
			max-width: none;
		}

		.seminar-list {
			display: grid;
			gap: 0.72rem;
		}

		.seminar-item {
			border-top: 1px solid var(--border-color);
			padding-top: 0.58rem;
		}

		.seminar-item.approved {
			border-top-color: var(--text-primary);
		}

		.seminar-item.request.pending {
			border-top-color: var(--color-warning-text);
		}

		.seminar-item.request.approved {
			border-top-color: var(--color-success-text);
		}

		.seminar-item.request.rejected {
			border-top-color: var(--color-danger-text);
		}

		.seminar-info {
			display: grid;
			gap: 0.2rem;
		}

		.sem-state {
			margin: 0;
			font-family: var(--font-mono);
			font-size: 0.64rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-secondary);
		}

		.sem-title {
			margin: 0;
			font-family: var(--font-display);
			font-style: italic;
			font-size: 0.96rem;
			color: var(--text-primary);
		}

		.sem-meta {
			margin: 0;
			color: var(--text-secondary);
			font-size: 0.8rem;
		}

		.view-mode {
			display: grid;
			gap: 0.16rem;
		}

		.edit-form {
			display: grid;
			gap: 0.42rem;
			width: min(100%, 32rem);
		}

		.profile-form {
			width: min(100%, 34rem);
		}

		.profile-summary {
			display: grid;
			gap: 0.66rem;
			max-width: 100%;
		}

		.edit-input,
		.edit-textarea,
		.profile-form input,
		.profile-form textarea {
			width: 100%;
			padding: 0.48rem 0.54rem;
			border: 1px solid var(--border-color);
			background: var(--bg-primary);
			color: var(--text-primary);
			font-family: var(--font-body);
			font-size: 0.88rem;
			line-height: 1.42;
			resize: none;
		}

		.paper-details-content .paper-btn.primary {
			background: transparent;
			color: var(--text-primary);
			border-color: var(--text-primary);
		}

		.paper-details-content .paper-btn.primary:hover:not(:disabled) {
			background: var(--text-primary);
			color: var(--bg-primary);
		}

		.edit-input:focus,
		.edit-textarea:focus,
		.profile-form input:focus,
		.profile-form textarea:focus {
			outline: 2px solid var(--latex-accent, var(--text-primary));
			outline-offset: 1px;
		}

		.edit-actions {
			display: flex;
			gap: 0.4rem;
		}

		.profile-actions {
			justify-content: flex-start;
		}

		.paper-btn.btn-edit-inline {
			margin-top: 0.38rem;
		}

		.paper-figure {
			margin: 0.48rem auto 0;
			padding-top: 0.34rem;
			border: none;
			display: grid;
			justify-items: center;
		}

		.attendance-figure {
			width: min(100%, 27rem);
		}

		.attendance-divider {
			width: 100%;
			margin: 0.16rem auto 0;
			border-top: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
		}

		.figure-body {
			display: grid;
			gap: 0.6rem;
			width: 100%;
		}

		.paper-figure figcaption {
			margin: 0.58rem 0 0.62rem;
			text-align: center;
			font-family: var(--font-display);
			font-size: 0.95rem;
			font-style: italic;
		}

		.stat-table {
			width: 100%;
			border-collapse: collapse;
		}

		.stat-table th,
		.stat-table td {
			padding: 0.42rem 0.44rem;
			border-bottom: none;
		}

		.stat-table th {
			text-align: left;
			font-family: var(--font-mono);
			font-size: 0.64rem;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			font-weight: 640;
			color: var(--text-secondary);
			white-space: nowrap;
		}

		.stat-table td {
			font-size: 0.98rem;
			color: var(--text-primary);
		}

		.attendance-meter {
			height: 0.9rem;
			border: 1px solid var(--border-color);
			background: var(--bg-primary);
			overflow: hidden;
		}

		.attendance-fill {
			height: 100%;
			background: var(--text-primary);
			min-width: 0;
		}

		.filters {
			display: flex;
			flex-wrap: wrap;
			gap: 0.46rem;
			margin-top: 0.42rem;
			width: min(100%, 46rem);
			max-width: 46rem;
			margin-inline: auto;
			justify-content: center;
		}

		.paper-bridge {
			width: min(100%, 38rem);
			font-size: 0.84rem;
			line-height: 1.68;
			color: var(--text-secondary);
			text-align: justify;
			text-indent: 1.2em;
		}

		.paper-bridge-stats {
			margin: 0.26rem auto 0.46rem;
		}

		.paper-bridge-activities {
			margin: 0.34rem auto 0.54rem;
		}

		.paper-bridge .xref {
			font-family: var(--font-mono);
			font-size: 0.78em;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--text-primary);
			text-indent: 0;
		}

		.semester-select {
			padding: 0.44rem 0.58rem;
			border: 1px solid var(--border-color);
			font-size: 0.69rem;
			background: var(--bg-primary);
			color: var(--text-primary);
			cursor: pointer;
			font-family: var(--font-mono);
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			width: min(100%, calc(var(--select-width-ch, 10) * 1ch + 2.35rem));
			min-width: 7.8rem;
			max-width: 12.6rem;
			flex: 0 1 auto;
		}

		.semester-select:focus-visible {
			outline: 2px solid var(--latex-accent, var(--text-primary));
			outline-offset: 2px;
		}

		.table-figure {
			margin-top: 0.58rem;
			width: 100%;
		}

		.table-scroll {
			justify-self: stretch;
			width: 100%;
			max-width: 100%;
			overflow-x: auto;
			overflow-y: hidden;
			-webkit-overflow-scrolling: touch;
		}

		.activity-table {
			width: max(100%, var(--table-min-width, 34rem));
			min-width: max(100%, var(--table-min-width, 34rem));
			max-width: none;
			border-collapse: collapse;
			text-align: left;
			margin-inline: 0;
		}

		.activity-table thead th {
			padding: var(--table-cell-pad, 0.56rem) calc(var(--table-cell-pad, 0.56rem) + 0.08rem);
			font-size: calc(0.65rem * var(--table-font-scale, 1));
			letter-spacing: 0.08em;
			text-transform: uppercase;
			font-family: var(--font-mono);
			color: var(--text-secondary);
			border-bottom: 1px solid var(--text-primary);
		}

		.activity-table thead th:last-child,
		.activity-table tbody td:last-child {
			text-align: center;
			width: 6.2rem;
		}

		.activity-table tbody td {
			padding: calc(var(--table-cell-pad, 0.56rem) + 0.04rem)
				calc(var(--table-cell-pad, 0.56rem) + 0.08rem);
			border-bottom: 1px dotted var(--border-color);
			font-size: calc(0.95rem * var(--table-font-scale, 1));
		}

		.activity-table tbody tr:last-child td {
			border-bottom: none;
		}

		.date {
			white-space: nowrap;
			color: var(--text-secondary);
			font-size: calc(0.77rem * var(--table-font-scale, 1));
			font-family: var(--font-mono);
		}

		.activity-link {
			color: var(--text-primary);
			text-decoration: none;
			font-family: var(--font-display);
			font-style: italic;
			transition: color 0.2s;
			display: inline-block;
			max-width: var(--table-name-max, 30ch);
			overflow-wrap: anywhere;
			text-underline-offset: 0.12em;
			text-decoration-thickness: 1px;
		}

		.activity-link:hover {
			text-decoration: underline;
		}

		.activity-link:focus-visible {
			outline: 2px solid var(--latex-accent, var(--text-primary));
			outline-offset: 2px;
		}

		.attendance-badge {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 3.9rem;
			padding: 0.19rem 0.54rem;
			font-family: var(--font-mono);
			font-size: calc(0.66rem * var(--table-font-scale, 1));
			letter-spacing: 0.02em;
			text-transform: uppercase;
			font-weight: 680;
			border: 1px solid;
			border-left-width: 3px;
			line-height: 1.1;
		}

		.attendance-badge.attended {
			color: var(--color-success-text);
			background: color-mix(in srgb, var(--color-success-bg) 78%, var(--bg-primary));
			border-color: color-mix(in srgb, var(--color-success-text) 65%, var(--border-color));
		}

		.attendance-badge.absent {
			color: var(--color-danger-text);
			background: color-mix(in srgb, var(--color-danger-bg) 82%, var(--bg-primary));
			border-color: color-mix(in srgb, var(--color-danger-text) 66%, var(--border-color));
		}

		.empty-hint {
			margin: 0;
			padding: 0.46rem 0;
			font-style: italic;
			color: var(--text-secondary);
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

	.paper-side-mark {
		position: fixed;
		left: max(0.06rem, env(safe-area-inset-left));
		top: calc(var(--nav-height) + env(safe-area-inset-top) + 0.32rem);
		bottom: calc(0.75rem + env(safe-area-inset-bottom));
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
			opacity: 0.2;
			z-index: 1;
		}

		.paper-symbol-bg span {
			font-family: var(--font-math, var(--font-display));
			font-size: clamp(1.2rem, 2.35vw, 1.86rem);
			line-height: 1;
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

	.cover-page {
		min-height: calc(100vh - var(--nav-height) - 4rem);
		min-height: calc(100dvh - var(--nav-height) - 4rem);
		padding: clamp(1.4rem, 3vw, 2.2rem) 0;
		justify-content: flex-start;
		--cover-center-width: 66rem;
		margin-bottom: 2rem;
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
		border-top: 1px solid var(--latex-rule, var(--border-color));
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

	.google-login-btn:focus-visible {
		outline: 2px solid var(--latex-accent, var(--text-primary));
		outline-offset: 3px;
	}

	.login-hint {
		margin: 0;
		font-size: 0.71rem;
		font-family: var(--font-mono);
		color: var(--latex-muted, var(--text-secondary));
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.scroll-hint-wrapper {
		margin-top: 1.8rem;
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		opacity: 0.82;
	}

	.scroll-hint {
		margin: 0;
		text-align: center;
		font-size: 0.72rem;
		font-family: var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--latex-muted, var(--text-secondary));
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.42rem;
	}

	.scroll-connector {
		width: 1px;
		height: 4rem;
		background: linear-gradient(to bottom, var(--latex-rule, var(--border-color)), transparent);
		position: relative;
	}

	.scroll-connector::after {
		content: "";
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 5px;
		height: 5px;
		border-right: 1px solid var(--latex-rule, var(--border-color));
		border-bottom: 1px solid var(--latex-rule, var(--border-color));
		transform: translateX(-50%) rotate(45deg);
		animation: arrow-slide 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	@keyframes arrow-slide {
		0% { transform: translateX(-50%) translateY(-20px) rotate(45deg); opacity: 0; }
		50% { opacity: 1; }
		100% { transform: translateX(-50%) translateY(5px) rotate(45deg); opacity: 0; }
	}

	.abstract-page {
		padding: clamp(1.7rem, 3.5vw, 2.5rem) 0;
		align-items: center;
		position: relative;
	}

	.abstract-page::before {
		content: "";
		position: absolute;
		top: -2.5rem;
		left: 50%;
		transform: translateX(-50%);
		width: 1px;
		height: 2.5rem;
		background: linear-gradient(to top, var(--latex-rule, var(--border-color)), transparent);
	}

	.abstract-title {
		margin: 0;
		margin-inline: auto;
		padding-top: 1.2rem;
		border-top: 1px solid var(--latex-rule, var(--border-color));
		font-size: clamp(1.42rem, 3vw, 1.9rem);
		font-weight: 600;
		text-align: center;
		color: var(--latex-text, var(--text-primary));
		width: min(100%, 46rem);
		position: relative;
	}

	.abstract-title::before {
		content: attr(data-glyph);
		position: absolute;
		top: -1.35rem;
		left: 50%;
		transform: translateX(-50%);
		font-family: var(--font-math, var(--font-display));
		font-size: 1.55rem;
		color: var(--latex-muted, var(--text-secondary));
		opacity: 0.5;
	}

	.abstract-body {
		margin: 1.05rem 0 0;
		margin-inline: auto;
		font-size: clamp(0.96rem, 1.65vw, 1.04rem);
		line-height: 1.78;
		text-align: justify;
		color: var(--latex-text, var(--text-primary));
		width: min(100%, 46rem);
	}

	.drop-cap {
		float: left;
		font-family: var(--font-display);
		font-size: 3.42rem;
		line-height: 0.82;
		padding-top: 0.12rem;
		padding-right: 0.46rem;
		padding-left: 0.08rem;
		color: var(--text-primary);
		font-weight: 640;
	}

	.inline-ref {
		font-size: 0.72em;
		letter-spacing: 0.03em;
		color: var(--latex-muted, var(--text-secondary));
	}

	.abstract-links {
		margin: 1.12rem 0 0;
		margin-inline: auto;
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

	.abstract-link-item a:focus-visible {
		outline: 1px solid var(--latex-accent, var(--latex-rule, var(--text-primary)));
		outline-offset: 2px;
	}

		@media (max-width: 900px) {
		.dashboard-header {
			align-items: flex-start;
			flex-direction: column;
		}

			.filters {
				width: 100%;
				justify-content: center;
			}

		.guest-paper {
			--side-mark-gutter: 1.06rem;
			padding: 0 var(--side-mark-gutter);
		}

		.paper-side-mark {
			left: max(0.04rem, env(safe-area-inset-left));
			top: calc(var(--nav-height) + env(safe-area-inset-top) + 0.25rem);
			bottom: calc(0.7rem + env(safe-area-inset-bottom));
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

		.dashboard-paper {
			padding: 0.86rem 0.78rem 1.05rem;
		}

			.semester-select {
				min-width: 7.2rem;
				max-width: none;
				flex: 0 1 calc(50% - 0.24rem);
			}

			.paper-bridge {
				width: 100%;
				font-size: 0.8rem;
				line-height: 1.6;
				text-indent: 0.8em;
			}

			.paper-bridge-stats {
				margin: 0.2rem auto 0.4rem;
			}

			.activity-table thead th:last-child,
			.activity-table tbody td:last-child {
				width: 5.6rem;
			}

		.paper-page {
			min-height: calc(100svh - var(--nav-height) - 0.35rem);
			scroll-snap-stop: normal;
		}

		.paper-side-mark {
			left: max(0.02rem, env(safe-area-inset-left));
			bottom: calc(0.68rem + env(safe-area-inset-bottom));
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
				justify-content: center;
				align-items: center;
				min-height: calc(100svh - var(--nav-height) - 0.35rem);
				padding: 1.5rem 0;
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
			bottom: calc(0.65rem + env(safe-area-inset-bottom));
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
