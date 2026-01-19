<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="wait-container">
	<div class="alert-box">
		<span class="icon">⌛</span>
		<h1>가입 승인 대기 중</h1>
		<p class="msg">
			안녕하세요, {data.user?.name}님!<br>
			회원 가입 신청이 정상적으로 접수되어 현재 관리자의 승인을 기다리고 있습니다.
		</p>
		<p class="hint">승인이 완료되면 SNUMPS 자동화 시스템의 모든 기능을 이용하실 수 있습니다.</p>
		
		<div class="alert-actions">
			<a href="/signup/edit" class="btn-edit">📝 신청 정보 수정하기</a>
			<button class="btn-logout" onclick={() => signOut()}>로그아웃</button>
		</div>
	</div>
</div>

<style>
	.wait-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 70vh;
		padding: 2rem;
	}

	.alert-box {
		background: var(--bg-secondary);
		padding: 3.5rem 2rem;
		border-radius: 24px;
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
		text-align: center;
		max-width: 550px;
		width: 100%;
	}

	.icon { 
		font-size: 4rem; 
		display: block; 
		margin-bottom: 1.5rem; 
	}

	h1 {
		font-size: 1.75rem;
		margin-bottom: 1.5rem;
		color: var(--text-primary);
	}

	.msg { 
		font-size: 1.1rem; 
		line-height: 1.7; 
		margin-bottom: 1rem;
		color: var(--text-primary);
	}

	.hint { 
		color: var(--text-secondary); 
		font-size: 0.95rem; 
		margin-bottom: 2.5rem; 
	}
	
	.alert-actions { 
		display: flex; 
		flex-direction: column; 
		gap: 1rem; 
		max-width: 300px;
		margin: 0 auto;
	}

	.btn-edit { 
		display: block;
		padding: 1rem;
		background: #667eea;
		color: white;
		text-decoration: none;
		border-radius: 12px;
		font-weight: 600;
		transition: transform 0.2s, opacity 0.2s;
	}

	.btn-edit:hover {
		transform: translateY(-2px);
		opacity: 0.9;
	}

	.btn-logout {
		padding: 1rem;
		background: transparent;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		border-radius: 12px;
		cursor: pointer;
		font-weight: 600;
		transition: background-color 0.2s;
	}

	.btn-logout:hover {
		background-color: var(--btn-secondary);
		color: var(--text-primary);
	}
</style>
