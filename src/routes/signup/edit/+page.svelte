<script lang="ts">
    import { enhance } from '$app/forms';
	let { data, form } = $props();
    let submitting = $state(false);
</script>

<article class="paper-document signup-paper">
	<header class="paper-document-header">
		<h1 class="paper-document-title">가입 신청 수정 원고</h1>
		<p class="paper-document-subtitle no-sel">Revision Draft</p>
	</header>

	{#if form?.error}
		<p class="paper-status-note error">{form.error}</p>
	{/if}

	{#if form?.success}
		<ol class="paper-sections">
			<li class="paper-section">
				<h2 class="paper-section-title">Revision Saved</h2>
				<p class="paper-status-note success">신청 정보가 성공적으로 반영되었습니다.</p>
				<div class="paper-actions">
					<a href="/" class="paper-btn primary">홈으로 이동</a>
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
			<input type="hidden" name="id" value={data.application?.id} />
			<ol class="paper-sections">
				<li class="paper-section">
					<h2 class="paper-section-title">Author Metadata</h2>
					<fieldset class="paper-fieldset">
						<div class="paper-field">
							<label for="name" class="paper-label">이름</label>
							<input type="text" id="name" value={data.parsedInfo.name} disabled />
							<span class="paper-hint">SNU 계정 기반</span>
						</div>
						<div class="paper-field">
							<label for="department" class="paper-label">학과</label>
							<input type="text" id="department" value={data.parsedInfo.department} disabled />
							<span class="paper-hint">SNU 계정 기반</span>
						</div>
						<div class="paper-field">
							<label for="email" class="paper-label">이메일</label>
							<input type="text" id="email" value={data.user?.email} disabled />
							<span class="paper-hint">로그인된 계정</span>
						</div>
					</fieldset>
				</li>
				<li class="paper-section">
					<h2 class="paper-section-title">Revision Fields</h2>
					<fieldset class="paper-fieldset">
						<div class="paper-field">
							<label for="phone" class="paper-label">전화번호 *</label>
							<input
								type="tel"
								id="phone"
								name="phone"
								value={data.application?.phone || ''}
								required
								placeholder="010-0000-0000"
								pattern="(\d&#123;11&#125;)|(\d&#123;3&#125;-\d&#123;4&#125;-\d&#123;4&#125;)"
								title="11자리 숫자 또는 XXX-XXXX-XXXX 형식으로 입력해주세요."
							/>
						</div>
						<div class="paper-field">
							<label for="background" class="paper-label">배경지식</label>
							<textarea
								id="background"
								name="background"
								rows="4"
								placeholder="관심 분야나 관련 경험을 적어주세요."
							>{data.application?.background || ''}</textarea>
						</div>
					</fieldset>
				</li>
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
	.signup-paper {
		width: min(100%, 44rem);
	}

	.paper-form {
		margin: 0;
	}

	.paper-hint {
		font-size: 0.72rem;
		color: var(--text-secondary);
	}

	.paper-field input[id="email"],
	.paper-field input[id="phone"] {
		font-family: var(--font-mono);
		font-size: 0.86rem;
	}

	.paper-field input:disabled {
		opacity: 0.84;
		color: var(--text-secondary);
		border-style: dashed;
	}

	@media (max-width: 620px) {
		.signup-paper {
			margin: 0.9rem auto;
			padding-inline: 0.78rem;
		}
	}
</style>
