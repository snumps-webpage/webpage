<script lang="ts">
    import { enhance } from '$app/forms';
	import SignupMetadataFields from '$lib/components/signup/SignupMetadataFields.svelte';
	import SignupContactFields from '$lib/components/signup/SignupContactFields.svelte';
	import SignupConsentField from '$lib/components/signup/SignupConsentField.svelte';
	import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import SuccessScreen from '$lib/components/SuccessScreen.svelte';
    import { MANUSCRIPT } from '$lib/constants';

	let { data, form } = $props();
    let submitting = $state(false);
    function getIssues(value: typeof form): Record<string, string> {
        return value && 'issues' in value && value.issues && typeof value.issues === 'object'
            ? value.issues as Record<string, string>
            : {};
    }
    let issues = $derived(getIssues(form));
</script>

<article class="paper-document">
    <ManuscriptHeader 
        title="회원가입 신청" 
        subtitle="Membership Submission Draft" 
        figure={MANUSCRIPT.FIGURES.SIGNUP}
    />

	{#if data.preview}
		<p class="paper-status-note muted">
			개발 프리뷰입니다. 제출한 신청은 관리자 프리뷰 대기열에 반영됩니다.
		</p>
	{/if}

	{#if data.pending}
		<ol class="paper-sections">
			<li class="paper-section">
				<h2 class="paper-section-title">Application Status</h2>
				<p class="paper-hint">가입 신청이 이미 접수되었습니다. 관리자 승인 결과를 기다려 주세요.</p>
				<div class="paper-actions">
					<a href={data.preview ? '/wait?preview=1' : '/wait'} class="paper-btn primary">
						대기 페이지로 이동
					</a>
				</div>
			</li>
		</ol>
	{:else}
		{#if form?.error}
			<p class="paper-status-note error">{form.message ?? form.error}</p>
		{/if}

			{#if form?.success}
                <SuccessScreen 
                    title="가입 신청이 완료되었습니다!" 
                    description="승인 여부는 메일로 안내됩니다." 
                    buttonLabel="승인 대기 화면"
                    buttonLink={data.preview ? '/wait?preview=1' : '/wait'}
                />
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
						<ol class="paper-sections">
							<SignupMetadataFields 
								name={data.parsedInfo.name} 
								department={data.parsedInfo.department} 
								email={data.user?.email ?? ''} 
							/>

							<SignupContactFields title="Submission" {issues} />

							<SignupConsentField error={issues.agreement ?? ''} />
				</ol>

				<div class="paper-actions">
					<button type="submit" class="paper-btn primary" disabled={submitting}>
						{submitting ? '처리 중...' : '가입 신청하기'}
					</button>
					<a href="/" class="paper-btn secondary">취소</a>
				</div>
			</form>
		{/if}
	{/if}
</article>

<style>
	/* All manuscript styling centralized in lib/manuscript.css */
</style>
