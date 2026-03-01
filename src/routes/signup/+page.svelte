<script lang="ts">
    import { enhance } from '$app/forms';
	let { data, form } = $props();
    let submitting = $state(false);
	const phoneInputPattern = '0[0-9]{9,10}|0[0-9]{2}-[0-9]{3,4}-[0-9]{4}';
</script>

<article class="paper-document signup-paper">
	<header class="paper-document-header">
		<h1 class="paper-document-title no-sel">회원가입 신청</h1>
		<p class="paper-document-subtitle no-sel">Membership Submission Draft</p>
	</header>

	{#if data.preview}
		<p class="paper-status-note muted">
			미리보기 모드입니다. 이 화면에서는 실제 가입 신청이 제출되지 않습니다.
		</p>
	{/if}

	{#if data.pending}
		<ol class="paper-sections">
			<li class="paper-section">
				<h2 class="paper-section-title">Application Status</h2>
				<p class="paper-form-note">가입 신청이 이미 접수되었습니다. 관리자 승인 결과를 기다려 주세요.</p>
				<div class="paper-actions">
					<a href="/wait" class="paper-btn primary">대기 페이지로 이동</a>
				</div>
			</li>
		</ol>
	{:else}
		{#if form?.error}
			<p class="paper-status-note error">{form.error}</p>
		{/if}

			{#if form?.success}
				<ol class="paper-sections">
					<li class="paper-section">
						<h2 class="paper-section-title">Submission Completed</h2>
						<p class="paper-status-note success">가입 신청이 성공적으로 접수되었습니다.</p>
						<p class="paper-form-note">승인 여부는 메일로 안내됩니다.</p>
						<div class="paper-actions">
							<a href="/" class="paper-btn primary">메인으로 이동</a>
					</div>
				</li>
			</ol>
		{:else}
				<form
					method="POST"
					class="paper-form"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
				>
						<ol class="paper-sections">
							<li class="paper-section">
								<h2 class="paper-section-title">Metadata</h2>
								<fieldset class="paper-fieldset">
									<div class="paper-field">
										<label for="name" class="paper-label">이름</label>
										<input type="text" id="name" value={data.parsedInfo.name} disabled />
								</div>
								<div class="paper-field">
									<label for="department" class="paper-label">학과</label>
									<input type="text" id="department" value={data.parsedInfo.department} disabled />
								</div>
								<div class="paper-field">
									<label for="email" class="paper-label">이메일</label>
									<input type="text" id="email" value={data.user?.email} disabled />
								</div>
							</fieldset>
							</li>

							<li class="paper-section">
								<h2 class="paper-section-title">Submission</h2>
								<fieldset class="paper-fieldset">
									<div class="paper-field">
										<label for="phone" class="paper-label">전화번호 <span class="req">*</span></label>
									<input
										type="tel"
										id="phone"
									name="phone"
									required
									placeholder="010-0000-0000"
									pattern={phoneInputPattern}
									title="10~11자리 숫자 또는 XXX-XXX(X)-XXXX 형식으로 입력해주세요."
								/>
							</div>
							<div class="paper-field">
								<label for="background" class="paper-label">배경지식</label>
								<textarea
									id="background"
									name="background"
									rows="4"
									placeholder="관심 분야나 관련 경험을 적어주세요."
									></textarea>
								</div>
							</fieldset>
							</li>

							<li class="paper-section">
								<h2 class="paper-section-title">Consent</h2>
								<label class="consent-line">
									<input type="checkbox" name="agreement" required />
									<span>개인정보 수집 및 이용에 동의합니다. (필수)</span>
						</label>
						<p class="paper-form-note no-sel">
							입력하신 정보는 동아리 운영 목적으로만 사용됩니다. 가입 승인 관련 사항은 메일로 안내됩니다.
						</p>
					</li>
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
	.signup-paper {
		width: min(100%, 54rem);
		margin: 1.1rem auto;
		padding: 1rem 1rem 1.12rem;
		background: var(--latex-bg);
		border: 1px solid var(--latex-rule);
		border-top-width: 2px;
		color: var(--latex-text);
	}

	.paper-form {
		width: 100%;
	}

	.signup-paper .paper-sections {
		gap: 0.95rem;
	}

	.signup-paper .paper-section {
		padding-top: 0.76rem;
		border-top-color: var(--latex-rule);
	}

	.signup-paper .paper-fieldset {
		gap: 0.85rem;
		max-width: 42rem;
	}

	.signup-paper .paper-label {
		display: block;
		margin-bottom: 0.16rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--latex-muted);
	}

	.req {
		color: var(--latex-accent);
	}

	.signup-paper input,
	.signup-paper textarea {
		width: 100%;
		padding: 0.7rem 0.76rem;
		border: 1px solid var(--latex-rule);
		background: var(--latex-bg);
		color: var(--latex-text);
		font-family: var(--font-body);
		font-size: 0.98rem;
		line-height: 1.5;
		resize: vertical;
	}

	.signup-paper input::placeholder,
	.signup-paper textarea::placeholder {
		color: var(--latex-muted);
	}

	.signup-paper input:focus-visible,
	.signup-paper textarea:focus-visible {
		outline: 2px solid var(--latex-accent);
		outline-offset: 2px;
	}

	.signup-paper .paper-status-note {
		margin-bottom: 0.7rem;
	}

	.signup-paper .paper-field input[id="phone"] {
		font-family: var(--font-mono);
		font-size: 0.86rem;
	}

	.signup-paper .paper-field input:disabled {
		opacity: 0.8;
		color: var(--latex-muted);
		border-style: dashed;
		background: color-mix(in srgb, var(--latex-bg) 90%, var(--latex-rule));
	}

	.signup-paper .paper-field textarea {
		min-height: 7.2rem;
	}

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

	.signup-paper .paper-actions {
		margin-top: 0.72rem;
		padding-top: 0.62rem;
		border-top-color: var(--latex-rule);
	}

	@media (max-width: 620px) {
		.signup-paper {
			margin: 1rem auto;
			padding: 1.2rem 1rem 1.35rem;
		}

		.signup-paper .paper-fieldset {
			max-width: 100%;
		}
	}
</style>
