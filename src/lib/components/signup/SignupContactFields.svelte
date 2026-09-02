<script lang="ts">
	let { title = 'Submission', phone = '', studentId = '', background = '', issues = {} } = $props();
</script>

<li class="paper-section">
	<h2 class="paper-section-title">{title}</h2>
	<div class="paper-field">
		<label for="studentId" class="paper-label">학번 <span class="req">*</span></label>
		<input
			type="text"
			id="studentId"
			name="studentId"
			value={studentId}
			required
			placeholder="2024-12345"
			pattern="[0-9][0-9][0-9][0-9]-?[0-9]+"
			title="학번을 2024-12345 형식으로 입력해주세요."
			inputmode="numeric"
			aria-invalid={Boolean(issues.studentId)}
			aria-describedby={issues.studentId ? 'studentId-error' : undefined}
		/>
		{#if issues.studentId}<small id="studentId-error" class="field-error">{issues.studentId}</small>{/if}
	</div>
	<div class="paper-field">
		<label for="phone" class="paper-label">전화번호 <span class="req">*</span></label>
		<input
			type="tel"
			id="phone"
			name="phone"
			value={phone}
			required
			placeholder="010-0000-0000"
			pattern="[0-9][0-9][0-9]-?[0-9][0-9][0-9][0-9]-?[0-9][0-9][0-9][0-9]"
			title="11자리 숫자 또는 XXX-XXXX-XXXX 형식으로 입력해주세요."
			inputmode="tel"
			autocomplete="tel"
			aria-invalid={Boolean(issues.phone)}
			aria-describedby={issues.phone ? 'phone-error' : undefined}
		/>
		{#if issues.phone}<small id="phone-error" class="field-error">{issues.phone}</small>{/if}
	</div>
	<div class="paper-field">
		<label for="background" class="paper-label">배경지식</label>
		<textarea
			id="background"
			name="background"
			rows="4"
			placeholder="관심 분야나 관련 경험을 적어주세요."
			aria-invalid={Boolean(issues.background)}
			aria-describedby={issues.background ? 'background-error' : undefined}
		>{background}</textarea>
		{#if issues.background}<small id="background-error" class="field-error">{issues.background}</small>{/if}
	</div>
</li>

<style>
	.req {
		color: var(--latex-accent);
	}

	.field-error {
		color: var(--color-danger-text);
		font-size: 0.72rem;
	}
</style>
