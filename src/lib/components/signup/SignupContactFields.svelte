<script lang="ts">
	import { PHONE_FORMAT_MESSAGE, PHONE_HTML_PATTERN } from '$lib/utils';

	let { title = 'Submission', phone = '', background = '' } = $props();
</script>

<li class="paper-section">
	<h2 class="paper-section-title">{title}</h2>
	<div class="paper-field">
		<label for="phone" class="paper-label">전화번호 <span class="req">*</span></label>
		<input
			type="tel"
			id="phone"
			name="phone"
			value={phone}
			required
			placeholder="010-0000-0000"
			pattern={PHONE_HTML_PATTERN}
			title={PHONE_FORMAT_MESSAGE}
			inputmode="tel"
			autocomplete="tel"
		/>
	</div>
	<div class="paper-field">
		<label for="background" class="paper-label">배경지식</label>
		<textarea
			id="background"
			name="background"
			rows="4"
			placeholder="관심 분야나 관련 경험을 적어주세요."
		>{background}</textarea>
	</div>
</li>

<style>
	.req {
		color: var(--latex-accent);
	}
</style>
