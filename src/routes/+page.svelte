<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
    	import { signIn } from '@auth/sveltekit/client';
        import { goto } from '$app/navigation';
    		import Skeleton from '$lib/components/Skeleton.svelte';
    		import SymbolBackground from '$lib/components/SymbolBackground.svelte';
    		import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    		import StatusBadge from '$lib/components/StatusBadge.svelte';
    		import { MANUSCRIPT } from '$lib/constants';
    		import { PHONE_FORMAT_MESSAGE, PHONE_HTML_PATTERN } from '$lib/utils';
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
    
        // State for dashboard data
        let dashboardData = $state<DashboardData | null>(null);
		let dashboardError = $state<string | null>(null);
		let dashboardLoading = $state(true);

		$effect(() => {
			// Resolve the streamed promise and update state
			data.streamed.dashboard
				.then((result) => {
					if (result && 'error' in result) {
						dashboardError = result.error ?? '알 수 없는 오류가 발생했습니다.';
					} else if (result) {
						dashboardData = result as DashboardData;
					}
				})
				.catch((err) => {
					console.error('Failed to resolve dashboard data:', err);
					dashboardError = '스트림 데이터를 처리하지 못했습니다.';
				})
				.finally(() => {
					dashboardLoading = false;
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
			<article class="paper-document dashboard-paper" class:refreshing={isRefreshing}>
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

				{#if dashboardLoading}
					<div class="dashboard-skeleton">
						<div class="skeleton-line"><Skeleton width="100%" height="32px" borderRadius="0" /></div>
						<div class="skeleton-line"><Skeleton width="100%" height="120px" borderRadius="0" /></div>
						<div class="skeleton-line"><Skeleton width="100%" height="190px" borderRadius="0" /></div>
					</div>
				{:else if dashboardError}
					<p class="paper-status-note error">데이터를 불러오지 못했습니다: {dashboardError}</p>
					<p class="paper-form-note">잠시 후 새로고침을 눌러 다시 시도해 주세요.</p>
				{:else if dashboardData}
					<ol class="paper-sections dashboard-sections">
						<li class="paper-section">
								<details class="paper-details" bind:open={showSeminars}>
									<summary class="paper-details-summary">
										<h2 class="paper-level-2" data-number="1">세미나 관리</h2>
										<span class="toggle-hint">{showSeminars ? '[닫기]' : '[열기]'}</span>
									</summary>
									<div class="paper-details-content seminar-content">
										<a href="/seminar/apply" class="paper-btn apply-seminar-btn">새 세미나 신청</a>
									{#if dashboardData.approvedSeminars.length === 0 && dashboardData.seminarRequests.length === 0}
										<p class="paper-form-note empty-hint">참여 중인 세미나나 신청 내역이 없습니다.</p>
									{:else}
										<div class="seminar-list">
											{#each dashboardData.approvedSeminars as seminar (seminar.id)}
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
											{#each dashboardData.seminarRequests as req (req.id)}
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
													value={dashboardData.profile.phone}
													placeholder="010-1234-5678"
													pattern={PHONE_HTML_PATTERN}
													title={PHONE_FORMAT_MESSAGE}
												/>
											</div>
											<div class="paper-field">
												<label for="background" class="paper-label no-sel">배경지식</label>
												<textarea
													id="background"
													name="background"
													rows="4"
													placeholder="관심 분야 등"
												>{dashboardData.profile.background}</textarea>
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
									출석 {dashboardData.myAttendanceStats.attended}회 / 전체 활동
									{dashboardData.myAttendanceStats.total}회(출석률
									{getAttendanceRatio(
										dashboardData.myAttendanceStats.attended,
										dashboardData.myAttendanceStats.total
									)}%)를
									<span class="xref">Figure 1</span>에 제시한다.
								</p>
								<figure class="paper-figure attendance-figure">
								<div class="figure-body">
									<table class="stat-table" aria-label="출석 통계">
										<tbody>
											<tr>
												<th scope="row">출석</th>
												<td>{dashboardData.myAttendanceStats.attended}</td>
												<th scope="row">전체 활동</th>
												<td>{dashboardData.myAttendanceStats.total}</td>
											</tr>
											<tr>
												<th scope="row">출석률</th>
												<td colspan="3">
													{getAttendanceRatio(
														dashboardData.myAttendanceStats.attended,
														dashboardData.myAttendanceStats.total
													)}%
												</td>
											</tr>
										</tbody>
									</table>
									<div class="attendance-meter" aria-hidden="true">
										<div
											class="attendance-fill"
											style="width: {getAttendanceRatio(
												dashboardData.myAttendanceStats.attended,
												dashboardData.myAttendanceStats.total
											)}%"
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
										style={`--select-width-ch: ${getSelectWidthCh(['전체 종류', ...getActivityTypes(dashboardData.activities)], 10)};`}
									>
										<option value="all">전체 종류</option>
										{#each getActivityTypes(dashboardData.activities) as type (type)}
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
										style={`--select-width-ch: ${getSelectWidthCh(['전체 학기', ...dashboardData.semesters.map((sem) => `${sem}학기`)], 10)};`}
									>
										<option value="all">전체 학기</option>
										{#each dashboardData.semesters as sem (sem)}
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
	/* Styles moved to $lib/manuscript.css */
</style>
