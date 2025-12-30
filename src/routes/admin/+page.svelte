<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data } = $props();
</script>

<div class="admin-container">
	<header>
		<h1>관리자 대시보드</h1>
		<a href="/" class="home-link">홈으로</a>
	</header>

	<section>
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
</div>

<style>
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
</style>
