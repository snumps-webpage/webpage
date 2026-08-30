<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import { MANUSCRIPT } from '$lib/constants';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<article class="paper-document wait-paper">
    <ManuscriptHeader 
        title="가입 승인 대기 문서" 
        subtitle="Membership Queue Notice" 
        figure={MANUSCRIPT.FIGURES.WAIT}
    />
	<ol class="paper-sections">
		<li class="paper-section">
			<h2 class="paper-section-title">Submission Status</h2>
			<p class="paper-form-note">
				안녕하세요, {data.user?.name}님. 회원 가입 신청이 정상적으로 접수되었으며, 현재 관리자의 승인 검토가 진행 중입니다.
			</p>
			<p class="paper-form-note">
				승인이 완료되면 SNUMPS 웹페이지의 모든 기능을 이용하실 수 있습니다.
			</p>
			{#if data.application}
				<dl class="application-summary">
					<div><dt>이름</dt><dd>{data.application.name}</dd></div>
					<div><dt>학과</dt><dd>{data.application.department}</dd></div>
					<div><dt>전화번호</dt><dd>{data.application.phone}</dd></div>
					<div><dt>신청 시각</dt><dd>{new Date(data.application.submittedAt).toLocaleString('ko-KR')}</dd></div>
				</dl>
			{/if}
		</li>
	</ol>
	<div class="paper-actions">
		<a href="/signup/edit" class="paper-btn primary">신청 정보 수정</a>
		<button class="paper-btn secondary" onclick={() => signOut()}>로그아웃</button>
	</div>
	{#if data.application}
		<form
			method="POST"
			action="?/withdrawApplication"
			class="withdraw-form"
			onsubmit={(event) => {
				if (!confirm('가입 신청을 철회하고 입력한 개인정보를 삭제할까요?')) event.preventDefault();
			}}
		>
			<input type="hidden" name="id" value={data.application.id} />
			<button class="paper-btn danger">가입 신청 철회</button>
			<p>철회하면 대기 중인 신청과 연락처·배경지식이 즉시 삭제됩니다.</p>
		</form>
	{/if}
</article>

<style>
	.wait-paper {
		width: min(100%, 42rem);
	}
	.application-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 1rem 0 0; border: 1px solid var(--latex-rule); }
	.application-summary div { min-width: 0; padding: 0.6rem; border-right: 1px solid var(--latex-rule); border-bottom: 1px solid var(--latex-rule); }
	.application-summary div:nth-child(2n) { border-right: 0; }
	.application-summary div:nth-last-child(-n + 2) { border-bottom: 0; }
	.application-summary dt { color: var(--latex-muted); font: 700 0.56rem/1.2 var(--font-mono); text-transform: uppercase; }
	.application-summary dd { margin: 0.2rem 0 0; overflow-wrap: anywhere; font-size: 0.76rem; }
	.withdraw-form { display: grid; justify-items: end; gap: 0.35rem; margin-top: 0.9rem; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }
	.withdraw-form p { margin: 0; color: var(--latex-muted); font-size: 0.7rem; text-align: right; }
	@media (max-width: 480px) { .application-summary { grid-template-columns: 1fr; } .application-summary div { border-right: 0; } .application-summary div:nth-last-child(2) { border-bottom: 1px solid var(--latex-rule); } .withdraw-form { justify-items: stretch; } .withdraw-form button { width: 100%; } }
</style>
