<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<article class="paper-document wait-paper">
	<header class="paper-document-header">
		<h1 class="paper-document-title">가입 승인 대기 문서</h1>
		<p class="paper-document-subtitle">Membership Queue Notice</p>
	</header>
	<ol class="paper-sections">
		<li class="paper-section">
			<h2 class="paper-section-title">Submission Status</h2>
			<p class="paper-form-note">
				안녕하세요, {data.user?.name}님. 회원 가입 신청이 정상적으로 접수되었으며, 현재 관리자의 승인 검토가 진행 중입니다.
			</p>
			<p class="paper-form-note">
				승인이 완료되면 SNUMPS 자동화 시스템의 모든 기능을 이용하실 수 있습니다.
			</p>
		</li>
	</ol>
	<div class="paper-actions">
		<a href="/signup/edit" class="paper-btn primary">신청 정보 수정</a>
		<button class="paper-btn secondary" onclick={() => signOut()}>로그아웃</button>
	</div>
</article>

<style>
	.wait-paper {
		width: min(100%, 42rem);
	}
</style>
