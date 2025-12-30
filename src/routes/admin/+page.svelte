<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data } = $props();
</script>

<div class="admin-container">
	<header>
		<h1>관리자 대시보드</h1>
		<div class="header-actions">
			<a href="/admin/events/new" class="create-event-btn">📅 새 이벤트 만들기</a>
			<a href="/" class="home-link">홈으로</a>
		</div>
	</header>

	<section class="events-section">
		<h2>이벤트 관리</h2>
		{#if data.events.length === 0}
			<p class="empty">생성된 이벤트가 없습니다.</p>
		{:else}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>제목</th>
							<th>일시</th>
							<th>종류</th>
							<th>상태</th>
							<th>링크</th>
							<th>관리</th>
						</tr>
					</thead>
					<tbody>
						{#each data.events as event}
							<tr class={event.status}>
								<td>{event.title}</td>
								<td>{new Date(event.date).toLocaleString()}</td>
								<td><span class="tag">{event.type}</span></td>
								<td><span class="status-badge {event.status}">{event.status.toUpperCase()}</span></td>
								<td>
									{#if event.status !== 'draft'}
										<div class="links">
											<button class="copy-btn" onclick={() => navigator.clipboard.writeText(`${window.location.origin}/events/${event.pathId}/attend`)}>Attend 📋</button>
											<button class="copy-btn" onclick={() => navigator.clipboard.writeText(`${window.location.origin}/events/${event.pathId}/leave`)}>Leave 📋</button>
										</div>
									{:else}
										<span class="hint">Not Published</span>
									{/if}
								</td>
								<td class="actions-cell">
									{#if event.status === 'draft' || event.status === 'expired'}
										<form method="POST" action="?/activateEvent" use:enhance>
											<input type="hidden" name="id" value={event.id} />
											<button class="btn activate small">Activate</button>
										</form>
									{:else if event.status === 'active'}
										<form method="POST" action="?/expireEvent" use:enhance>
											<input type="hidden" name="id" value={event.id} />
											<button class="btn expire small">Expire</button>
										</form>
									{/if}
									<form method="POST" action="?/deleteEvent" use:enhance onsubmit={() => confirm('정말 삭제하시겠습니까?')}>
										<input type="hidden" name="id" value={event.id} />
										<button class="btn delete small">Delete</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="mt-4">
		<h2>출석 승인 대기 ({data.attendanceQueue.length})</h2>
		{#if data.attendanceQueue.length === 0}
			<p class="empty">대기 중인 출석 요청이 없습니다.</p>
		{:else}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>이름</th>
							<th>학과</th>
							<th>이벤트</th>
							<th>시작 시간</th>
							<th>종료 시간</th>
							<th>관리</th>
						</tr>
					</thead>
					<tbody>
						{#each data.attendanceQueue as record}
							{@const event = data.events.find(e => e.id === record.eventId)}
							<tr>
								<td>{record.userName}</td>
								<td>{record.userDept}</td>
								<td>{event?.title ?? 'Unknown'}</td>
								<td>{new Date(record.startTime).toLocaleTimeString()}</td>
								<td>{record.endTime ? new Date(record.endTime).toLocaleTimeString() : '-'}</td>
								<td class="actions-cell">
									<form method="POST" action="?/approveAttendance" use:enhance>
										<input type="hidden" name="id" value={record.id} />
										<input type="hidden" name="eventId" value={record.eventId} />
										<input type="hidden" name="userEmail" value={record.userEmail} />
										<button class="btn approve small">승인</button>
									</form>
									<form method="POST" action="?/rejectAttendance" use:enhance>
										<input type="hidden" name="id" value={record.id} />
										<button class="btn reject small">거절</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="mt-4">
		<h2>가입 승인 대기 ({data.applications.length})</h2>
		
		{#if data.applications.length === 0}
			<p class="empty">대기 중인 가입 신청이 없습니다.</p>
		{:else}
			<div class="grid">
				{#each data.applications as app}
					<div class="card">
						<div class="card-header">
							<h3>{app.name}</h3>
							<span class="dept">{app.department}</span>
						</div>
						
						<div class="info">
							<p><strong>이메일:</strong> {app.email}</p>
							<p><strong>전화번호:</strong> {app.phone}</p>
							<p><strong>신청일:</strong> {new Date(app.submittedAt).toLocaleDateString()}</p>
						</div>

						<details>
							<summary>상세 정보 보기</summary>
							<div class="details-content">
								<p><strong>자기소개:</strong><br>{app.bio || '-'}</p>
								<p><strong>배경지식:</strong><br>{app.background || '-'}</p>
							</div>
						</details>

						<div class="actions">
							<form method="POST" action="?/approve" use:enhance>
								<input type="hidden" name="id" value={app.id} />
								<button class="btn approve">승인</button>
							</form>
							
							<form method="POST" action="?/reject" use:enhance onsubmit={() => confirm('정말 거절하시겠습니까?')}>
								<input type="hidden" name="id" value={app.id} />
								<button class="btn reject">거절</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="mt-4">
		<h2>탈퇴 신청 ({data.withdrawalRequests.length})</h2>
		{#if data.withdrawalRequests.length === 0}
			<p class="empty">대기 중인 탈퇴 신청이 없습니다.</p>
		{:else}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>이름</th>
							<th>이메일</th>
							<th>신청일</th>
							<th>관리</th>
						</tr>
					</thead>
					<tbody>
						{#each data.withdrawalRequests as req}
							<tr>
								<td>{req.name}</td>
								<td>{req.email}</td>
								<td>{new Date(req.requestedAt).toLocaleDateString()}</td>
								<td class="actions-cell">
									<form method="POST" action="?/approveWithdraw" use:enhance onsubmit={() => confirm(`정말 ${req.name}님의 탈퇴를 승인하시겠습니까?`)}>
										<input type="hidden" name="email" value={req.email} />
										<button class="btn approve small">승인</button>
									</form>
									<form method="POST" action="?/rejectWithdraw" use:enhance onsubmit={() => confirm('반려하시겠습니까?')}>
										<input type="hidden" name="email" value={req.email} />
										<button class="btn reject small">반려</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="mt-4">
		<h2>회원 관리 ({data.members.length})</h2>
		
		{#if data.members.length === 0}
			<p class="empty">회원이 없습니다.</p>
		{:else}
			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>이름</th>
							<th>학과</th>
							<th>가입일</th>
							<th>관리</th>
						</tr>
					</thead>
					<tbody>
						{#each data.members as member}
							<tr>
								<td>{member.name}</td>
								<td>{member.department}</td>
								<td>{member.joinDate}</td>
								<td>
									<form method="POST" action="?/withdraw" use:enhance onsubmit={() => confirm(`정말 ${member.name}님을 탈퇴 처리하시겠습니까?`)}>
										<input type="hidden" name="id" value={member.id} />
										<button class="btn reject small">탈퇴</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.mt-4 {
		margin-top: 4rem;
	}
	
	.admin-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		border-bottom: 1px solid #e5e7eb;
		padding-bottom: 1rem;
	}

	h1 { margin: 0; }

	.home-link {
		color: #6b7280;
		text-decoration: none;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.create-event-btn {
		background: #667eea;
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.create-event-btn:hover { opacity: 0.9; }

	.status-badge {
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.status-badge.draft { background: #e5e7eb; color: #374151; }
	.status-badge.active { background: #d1fae5; color: #059669; }
	.status-badge.expired { background: #fee2e2; color: #991b1b; }

	.links { display: flex; gap: 0.5rem; flex-direction: column; }
	.copy-btn {
		background: white;
		border: 1px solid #d1d5db;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.copy-btn:hover { background: #f9fafb; }
	.hint { color: #9ca3af; font-size: 0.8rem; }

	.activate { background: #10b981; color: white; }
	.expire { background: #fbbf24; color: white; }
	.delete { background: #6b7280; color: white; }

	.empty {
		color: #9ca3af;
		text-align: center;
		padding: 3rem;
		background: #f9fafb;
		border-radius: 8px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.card {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0,0,0,0.1);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.card-header h3 { margin: 0; font-size: 1.1rem; }
	.dept { 
		font-size: 0.85rem; 
		color: #4b5563; 
		background: #f3f4f6;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	.info p {
		margin: 0.5rem 0;
		font-size: 0.9rem;
		color: #374151;
	}

	details {
		margin: 1rem 0;
		font-size: 0.9rem;
	}
	
	summary {
		cursor: pointer;
		color: #667eea;
	}

	.details-content {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: #f9fafb;
		border-radius: 4px;
		color: #4b5563;
		white-space: pre-wrap;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}

	.btn {
		flex: 1;
		padding: 0.5rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 600;
		transition: opacity 0.2s;
	}

	.btn:hover { opacity: 0.9; }

	.approve {
		background: #10b981;
		color: white;
	}

	.reject {
		background: #ef4444;
		color: white;
	}

	.small {
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		width: auto;
	}

	.table-container {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}

	th, td {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	th {
		background: #f9fafb;
		font-weight: 600;
		color: #374151;
	}

	tr:last-child td {
		border-bottom: none;
	}

	.actions-cell {
		display: flex;
		gap: 0.5rem;
	}
</style>
