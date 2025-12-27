<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
	import { page } from '$app/stores';

	const session = $derived($page.data.session);
</script>

<div class="container">
	{#if session?.user}
		<h1>SNUMPS 자동화</h1>
		<p>환영합니다, {session.user.name}님!</p>
		<p class="email">{session.user.email}</p>
		<button class="logout-btn" onclick={() => signOut()}>로그아웃</button>
	{:else}
		<h1>SNUMPS 자동화</h1>
		<p>동아리 노션 자동화 시스템입니다.</p>
		<a href="/login" class="login-link">로그인하기</a>
	{/if}
</div>

<style>
	.container {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem;
		text-align: center;
	}

	h1 {
		color: #1a1a2e;
		margin-bottom: 1rem;
	}

	.email {
		color: #666;
		font-size: 0.9rem;
	}

	.login-link {
		display: inline-block;
		margin-top: 1rem;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 500;
	}

	.login-link:hover {
		opacity: 0.9;
	}

	.logout-btn {
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.logout-btn:hover {
		background: #e5e7eb;
	}
</style>
