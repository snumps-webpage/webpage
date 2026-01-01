<script lang="ts">
	import { signIn } from '@auth/sveltekit/client';
	import { page } from '$app/state';

	const error = $derived(page.url.searchParams.get('error'));

	function getErrorMessage(errorCode: string | null): string | null {
		if (!errorCode) return null;

		switch (errorCode) {
			case 'InvalidDomain':
				return '서울대학교 메일(@snu.ac.kr)로만 로그인할 수 있습니다.';
			case 'OAuthAccountNotLinked':
				return '이미 다른 방법으로 가입된 계정입니다.';
			default:
				return '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
		}
	}

	const errorMessage = $derived(getErrorMessage(error));
	const redirectTo = $derived(page.url.searchParams.get('redirect') || '/');
</script>

<div class="login-container">
	<div class="card">
		<h1>SNUMPS 자동화</h1>
		<p class="subtitle">동아리 노션 자동화 시스템</p>

		{#if errorMessage}
			<div class="error-message">
				{errorMessage}
			</div>
		{/if}

		<button class="google-btn" onclick={() => signIn('google', { redirectTo })}>
			<svg viewBox="0 0 24 24" width="24" height="24">
				<path
					fill="#4285F4"
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
				/>
				<path
					fill="#34A853"
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				/>
				<path
					fill="#FBBC05"
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				/>
				<path
					fill="#EA4335"
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				/>
			</svg>
			<span>서울대학교 구글 계정으로 로그인</span>
		</button>

		<p class="notice">@snu.ac.kr 메일만 사용할 수 있습니다.</p>
	</div>
</div>

<style>
	.login-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-primary);
		padding: 1rem;
	}

    .card {
        background: var(--bg-secondary);
        padding: 3rem;
        border-radius: 24px; /* Very soft corners */
        box-shadow: var(--shadow);
        width: 100%;
        max-width: 400px;
        text-align: center;
        border: 1px solid var(--border-color);
        transition: transform 0.2s ease;
    }

    .card:hover {
        transform: translateY(-2px);
    }

    h1 {
        margin-bottom: 0.5rem;
        font-size: 1.8rem;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.025em; /* Tighter tracking for headings */
    }

	.subtitle {
		color: #666;
		margin: 0 0 2rem;
		font-size: 0.9rem;
	}

	.error-message {
		background: #fee2e2;
		color: #dc2626;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}

    .google-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        padding: 0.75rem;
        background: white;
        border: 1px solid #dadce0;
        border-radius: 8px;
        color: #3c4043;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s;
        user-select: none;
    }

	.google-btn:hover {
		background: #f8f9fa;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.notice {
		margin: 1.5rem 0 0;
		color: #888;
		font-size: 0.8rem;
	}
</style>
