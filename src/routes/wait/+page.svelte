<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="wait-container">
	<div class="card">
		<span class="icon">⌛</span>
		<h1>가입 승인 대기 중</h1>
		<div class="success-message">
			<p class="msg">
				안녕하세요, {data.user?.name}님!<br>
				회원 가입 신청이 정상적으로 접수되어 현재 관리자의 승인을 기다리고 있습니다.
			</p>
			<p class="hint">승인이 완료되면 SNUMPS 자동화 시스템의 모든 기능을 이용하실 수 있습니다.</p>
			
			<div class="alert-actions mt-4">
				<a href="/signup/edit" class="btn edit">📝 신청 정보 수정하기</a>
				<button class="btn logout" onclick={() => signOut()}>로그아웃</button>
			</div>
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

	.card {
		background: var(--bg-secondary);
		padding: 3.5rem 2rem;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow);
		text-align: center;
		max-width: 550px;
		width: 100%;
		animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.icon { 
		font-size: 3rem; 
		display: block; 
		margin-bottom: 1rem; 
	}

	h1 {
		font-size: 2rem;
		margin-bottom: 1.5rem;
		color: var(--text-primary);
		font-family: var(--font-display);
		font-weight: 600;
		font-style: italic;
	}

	.msg { 
		font-size: 1.1rem; 
		line-height: 1.7; 
		margin-bottom: 1rem;
		color: var(--text-primary);
		font-family: var(--font-body);
	}

	.hint { 
		color: var(--text-secondary); 
		font-size: 0.95rem; 
		margin-bottom: 1.5rem; 
		font-family: var(--font-body);
		font-style: italic;
	}
	
	.alert-actions { 
		display: flex; 
		flex-direction: column; 
		gap: 1rem; 
		max-width: 300px;
		margin: 0 auto;
	}

	.btn {
        width: 100%;
        padding: 1rem;
        border-radius: 4px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        user-select: none;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        box-sizing: border-box;
    }

	.edit { 
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	.edit:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow);
	}

	.logout {
		background: transparent;
		border: 1px solid var(--border-color);
		color: var(--text-primary);
	}

	.logout:hover {
		border-color: var(--text-primary);
	}

	.success-message {
        text-align: center;
        color: var(--text-primary);
    }

	.mt-4 { margin-top: 2rem; }

	@keyframes slide-up-fade {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
