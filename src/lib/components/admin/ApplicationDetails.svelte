<script lang="ts">
	import CopyButton from '../CopyButton.svelte';
	let { email = '', phone = '', background = '' } = $props();
</script>

<div class="details-content">
	<p class="email-row">
		<strong>이메일:</strong> {email}
		<CopyButton text={email} title="이메일 복사" />
	</p>
	<p class="phone-row">
		<strong>전화번호:</strong> {phone}
		<CopyButton text={phone} title="전화번호 복사" />
	</p>
	<p><strong>배경지식:</strong><br>{background || '-'}</p>
</div>

<style>
	.details-content {
		border: 1px solid var(--latex-rule);
		padding: 0.62rem 0.7rem;
		font-family: var(--font-body);
		background: var(--latex-bg);
	}

	.details-content p {
		margin: 0.4rem 0;
	}

	.phone-row,
	.email-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
</style>
