<script lang="ts">
	let { error = '' } = $props();
</script>

<li class="paper-section">
	<h2 class="paper-section-title">Consent</h2>
	<label class="consent-line">
		<input type="checkbox" name="agreement" required aria-invalid={Boolean(error)} aria-describedby={error ? 'agreement-error' : undefined} />
		<span>개인정보 수집 및 이용에 동의합니다. (필수)</span>
	</label>
	{#if error}<p id="agreement-error" class="consent-error">{error}</p>{/if}
	<p class="paper-hint no-sel">
		입력하신 정보는 동아리 운영 목적으로만 사용됩니다. 가입 승인 관련 사항은 메일로 안내됩니다.
	</p>
</li>

<style>
	.consent-line {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: flex-start;
		column-gap: 0.62rem;
		row-gap: 0;
		font-size: 0.92rem;
		line-height: 1.52;
		padding: 0.66rem 0;
		border-top: 1px solid var(--latex-rule);
		border-bottom: 1px solid var(--latex-rule);
		margin-bottom: 0.52rem;
		color: var(--latex-text);
	}

	.consent-line input {
		margin-top: 0.16rem;
		width: 0.95rem;
		height: 0.95rem;
		accent-color: var(--latex-text);
	}

	.consent-line span {
		font-size: 0.91rem;
	}

	.consent-error {
		margin: 0.35rem 0;
		color: var(--color-danger-text);
		font-size: 0.72rem;
	}
</style>
