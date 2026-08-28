<script lang="ts">
	import { signIn } from '@auth/sveltekit/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>로그인 — SNUMPS</title>
</svelte:head>

<section class="login-page">
	<h1>로그인</h1>
	<p>서울대학교 계정(<code>@snu.ac.kr</code>)으로 로그인해 주세요.</p>
	<button
		class="google-login-btn"
		onclick={() => signIn('google', { callbackUrl: data.redirectTo })}
	>
		Google로 로그인
	</button>
</section>

<style>
	.login-page {
		max-width: 28rem;
		margin: 4rem auto;
		padding: 0 1rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
	}
	.google-login-btn {
		padding: 0.6rem 1.4rem;
		cursor: pointer;
	}
</style>
