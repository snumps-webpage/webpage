<script lang="ts">
	import { enhance } from '$app/forms';
	import { toasts } from '$lib/toasts';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		action,
		params = {},
		label,
		className = 'btn',
		confirmMessage = undefined,
		successMessage = undefined,
		errorMessage = '오류가 발생했습니다.',
		onSuccess = undefined,
		onResult = undefined,
		processing = $bindable(false),
		disabled = false,
		style = ''
	}: {
		action: string;
		params?: Record<string, unknown>;
		label: string;
		className?: string;
		confirmMessage?: string;
		successMessage?: string;
		errorMessage?: string;
		onSuccess?: (data: unknown) => void | Promise<void>;
		onResult?: (result: unknown) => void | Promise<void>;
		processing?: boolean;
		disabled?: boolean;
		style?: string;
	} = $props();

	const handleSubmit: SubmitFunction = ({ cancel }) => {
		if (confirmMessage && !confirm(confirmMessage)) {
			cancel();
			return;
		}

		processing = true;

		return async ({ result, update }) => {
			if (onResult) {
				await onResult(result);
			} else {
				if (result.type === 'success') {
					if (successMessage) toasts.success(successMessage);
					if (onSuccess) {
						await onSuccess(result.data);
					} else {
						await update();
					}
				} else if (result.type === 'failure' || result.type === 'error') {
					const errorMsg = (result as { data?: { error?: string } }).data?.error || errorMessage;
					toasts.error(errorMsg);
				}
			}

			processing = false;
		};
	};
</script>

<form method="POST" {action} use:enhance={handleSubmit} {style} class="action-form">
	{#each Object.entries(params) as [name, value] (name)}
		<input type="hidden" {name} value={String(value)} />
	{/each}
	<button type="submit" class={className} disabled={disabled || processing}>
		{#if processing}
			<span class="loading-spinner"></span>
		{/if}
		{label}
	</button>
</form>

<style>
	.action-form {
		display: inline-block;
	}

	.loading-spinner {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border: 1.5px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-right: 0.35rem;
		vertical-align: middle;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
