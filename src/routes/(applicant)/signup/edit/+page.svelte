<script lang="ts">
    import { enhance } from '$app/forms';
	import SignupMetadataFields from '$lib/components/signup/SignupMetadataFields.svelte';
	import SignupContactFields from '$lib/components/signup/SignupContactFields.svelte';
    import ManuscriptHeader from '$lib/components/ManuscriptHeader.svelte';
    import SuccessScreen from '$lib/components/SuccessScreen.svelte';
    import { MANUSCRIPT } from '$lib/constants';

	let { data, form } = $props();
    let submitting = $state(false);
</script>

<article class="paper-document">
    <ManuscriptHeader 
        title="가입 신청 수정 원고" 
        subtitle="Revision Draft" 
        figure={MANUSCRIPT.FIGURES.REVISION}
    />

	{#if form?.error}
		<p class="paper-status-note error">{form.error}</p>
	{/if}

	{#if form?.success}
        <SuccessScreen 
            title="신청 정보가 수정되었습니다." 
            description="신청 정보가 성공적으로 반영되었습니다." 
            buttonLabel="홈으로 이동"
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
					background={data.application?.background} 
				/>
			</ol>
			<div class="paper-actions">
				<button type="submit" class="paper-btn primary" disabled={submitting}>
					{submitting ? '처리 중...' : '수정하기'}
				</button>
				<a href="/" class="paper-btn secondary">취소</a>
			</div>
		</form>
	{/if}
</article>

<style>
	/* All manuscript styling centralized in lib/manuscript.css */
</style>
