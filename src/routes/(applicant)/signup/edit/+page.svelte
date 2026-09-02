<script lang="ts">
    import { enhance } from '$app/forms';
	import SignupMetadataFields from '$lib/components/signup/SignupMetadataFields.svelte';
	import SignupContactFields from '$lib/components/signup/SignupContactFields.svelte';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import SuccessScreen from '$lib/components/SuccessScreen.svelte';
    import { MANUSCRIPT } from '$lib/constants';

	let { data, form } = $props();
    let submitting = $state(false);
    let withdrawing = $state(false);
    function getIssues(value: typeof form): Record<string, string> {
        return value && 'issues' in value && value.issues && typeof value.issues === 'object'
            ? value.issues as Record<string, string>
            : {};
    }
    let issues = $derived(getIssues(form));
</script>

<article class="paper-document">
    <ManuscriptHeader 
        title="가입 신청 수정 원고" 
        subtitle="Revision Draft" 
        figure={MANUSCRIPT.FIGURES.REVISION}
    />

	{#if form?.error}
		<p class="paper-status-note error">{form.message ?? form.error}</p>
	{/if}

	{#if form?.success}
        <SuccessScreen 
            title={form.operation === 'applicationWithdrawn' ? '가입 신청을 철회했습니다.' : '신청 정보가 수정되었습니다.'}
            description={form.operation === 'applicationWithdrawn' ? '입력한 개인정보를 대기열에서 삭제했습니다.' : '신청 정보가 성공적으로 반영되었습니다.'}
            buttonLabel="메인으로 이동"
        />
	{:else if !data.application}
		<ol class="paper-sections">
			<li class="paper-section">
				<h2 class="paper-section-title">Application Status</h2>
				<p class="paper-hint">수정할 가입 신청이 없습니다.</p>
				<div class="paper-actions">
					<a href="/signup" class="paper-btn primary">새 신청서 열기</a>
				</div>
			</li>
		</ol>
	{:else}
		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<input type="hidden" name="id" value={data.application?.id} />
			<ol class="paper-sections">
				<SignupMetadataFields 
					name={data.parsedInfo.name} 
					department={data.parsedInfo.department} 
					email={data.user?.email ?? ''} 
				/>
				<SignupContactFields
					title="Revision Fields"
					phone={data.application?.phone}
					studentId={data.application?.studentId}
					background={data.application?.background}
					{issues}
				/>
			</ol>
			<div class="paper-actions">
				<button type="submit" class="paper-btn primary" disabled={submitting}>
					{submitting ? '처리 중...' : '수정하기'}
				</button>
				<a href="/" class="paper-btn secondary">취소</a>
			</div>
		</form>
		<form
			method="POST"
			action="/wait?/withdrawApplication"
			class="withdraw-form"
			onsubmit={(event) => {
				if (!confirm('가입 신청을 철회하고 입력한 개인정보를 삭제할까요?')) event.preventDefault();
			}}
			use:enhance={() => {
				withdrawing = true;
				return async ({ update }) => { await update(); withdrawing = false; };
			}}
		>
			<input type="hidden" name="id" value={data.application?.id} />
			<button class="paper-btn danger" disabled={withdrawing}>{withdrawing ? '처리 중...' : '가입 신청 철회'}</button>
			<p>철회하면 대기 중인 신청과 입력한 연락처·배경지식이 즉시 삭제됩니다.</p>
		</form>
	{/if}
</article>

<style>
	.withdraw-form { display: grid; justify-items: end; gap: 0.35rem; margin-top: 0.9rem; padding-top: 0.75rem; border-top: 1px solid var(--latex-rule); }
	.withdraw-form p { margin: 0; color: var(--latex-muted); font-size: 0.72rem; text-align: right; }
	@media (max-width: 480px) { .withdraw-form { justify-items: stretch; } .withdraw-form button { width: 100%; } }
</style>
