<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const session = $derived($page.data.session);
</script>

<div class="container">
	{#if session?.user}
		<div class="header">
			<div class="header-left">
				<a href="/" class="logo-link" aria-label="Home">
					<img src="/src/lib/assets/favicon.svg" alt="SNUMPS Logo" class="logo" />
				</a>
				<div>
					<h1>SNUMPS 활동 현황</h1>
					<p class="welcome">환영합니다, {session.user.name}님!</p>
				</div>
			</div>
			<div class="user-actions">
				<a href="/profile" class="profile-btn" aria-label="내 프로필">
					<img src="/src/lib/assets/favicon.svg" alt="Profile" />
				</a>
				<button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
			</div>
		</div>

		<div class="actions-bar">
			<a href="/notion" class="action-btn secondary">
				<span class="icon">📊</span>
				전체 DB 보기
			</a>
			{#if $page.data.isAdmin}
				<a href="/admin" class="action-btn secondary">
					<span class="icon">🛡️</span>
					관리자 페이지
				</a>
			{/if}
			<!-- Add more buttons here if needed -->
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
				<h3>활동 목록</h3>
				{#if data.activities.length === 0}
					<p class="empty-state">이번 학기 활동 내역이 없습니다.</p>
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
								{#each data.activities as activity}
									<tr class={activity.attended ? 'attended' : 'absent'}>
										<td class="date">{activity.date}</td>
										<td class="name">{activity.name}</td>
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

		<footer>
			<div class="footer-info">
				<p>회장: {data.presidentName} | <a href="mailto:snumps0@gmail.com">snumps0@gmail.com</a></p>
			</div>
			<div class="footer-actions">
				{#if data.hasPendingWithdrawal}
					<button class="withdraw-btn pending" disabled>탈퇴 승인 대기중</button>
				{:else}
					<form method="POST" action="?/requestWithdraw" use:enhance onsubmit={() => confirm('정말로 탈퇴를 신청하시겠습니까?\n관리자 승인 후 탈퇴 처리됩니다.')}>
						<button class="withdraw-btn subtle">탈퇴 신청</button>
					</form>
				{/if}
			</div>
		</footer>

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
		border-bottom: 1px solid #e5e7eb;
	}

	h1 {
		font-size: 1.75rem;
		color: #1a1a2e;
		margin: 0 0 0.5rem 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.logo-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		transition: transform 0.2s;
	}

	.logo-link:hover {
		transform: scale(1.1);
	}

	.logo {
		width: 100%;
		height: 100%;
	}

	.welcome {
		color: #4b5563;
		margin: 0;
	}

	.user-actions {
		text-align: right;
	}

	.logout-btn {
		font-size: 0.875rem;
		padding: 0.4rem 0.8rem;
		background: transparent;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		color: #4b5563;
		cursor: pointer;
	}

	.logout-btn:hover {
		background: #f3f4f6;
		color: #1f2937;
	}

	.profile-btn {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
		border: 2px solid white;
		box-shadow: 0 0 0 1px #e5e7eb;
		transition: transform 0.2s;
	}
	
	.profile-btn:hover {
		transform: scale(1.05);
	}

	.profile-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Footer */
	footer {
		margin-top: 4rem;
		padding-top: 2rem;
		border-top: 1px solid #e5e7eb;
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.footer-info a {
		color: #6b7280;
		text-decoration: none;
	}

	.footer-info a:hover {
		text-decoration: underline;
	}

	.withdraw-btn {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.2s;
	}

	.withdraw-btn.subtle:hover {
		border-color: #e5e7eb;
		color: #6b7280;
	}

	.withdraw-btn.pending {
		color: #fbbf24;
		cursor: not-allowed;
	}

	/* Actions Bar */
	.actions-bar {
		margin-bottom: 2rem;
		display: flex;
		gap: 1rem;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-radius: 8px;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.2s;
	}

	.action-btn.secondary {
		background: #f3f4f6;
		color: #374151;
	}

	.action-btn.secondary:hover {
		background: #e5e7eb;
	}

	/* Stats Card */
	.stats-card {
		background: white;
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
		margin-bottom: 2rem;
		border: 1px solid #e5e7eb;
	}

	.stats-card h2 {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
		color: #111827;
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
		color: #6b7280;
	}

	.stat-label {
		font-size: 0.875rem;
		color: #6b7280;
		margin-top: 0.25rem;
	}

	.stat-divider {
		font-size: 2rem;
		color: #d1d5db;
		font-weight: 300;
	}

	/* Activities List */
	.activities-list h3 {
		font-size: 1.25rem;
		margin: 0 0 1rem 0;
		color: #111827;
	}

	.table-container {
		background: white;
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		overflow: hidden;
		border: 1px solid #e5e7eb;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}

	th {
		background: #f9fafb;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
		border-bottom: 1px solid #e5e7eb;
	}

	td {
		padding: 0.875rem 1rem;
		border-bottom: 1px solid #f3f4f6;
		color: #1f2937;
	}

	tr:last-child td {
		border-bottom: none;
	}

	.date {
		white-space: nowrap;
		color: #6b7280;
		font-size: 0.9rem;
	}

	.tag {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: #f3f4f6;
		color: #4b5563;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.badge {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge.success {
		background: #d1fae5;
		color: #059669;
	}

	.badge.fail {
		background: #fee2e2;
		color: #dc2626;
	}

	.error-banner {
		background: #fee2e2;
		color: #991b1b;
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
	}

	.login-link:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 10px rgba(102, 126, 234, 0.5);
	}
</style>
