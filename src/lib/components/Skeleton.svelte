<script lang="ts">
	interface Props {
		width?: string;
		height?: string;
		borderRadius?: string;
		className?: string;
	}

	let { width = '100%', height = '1rem', borderRadius = '0', className = '' }: Props = $props();
</script>

<div 
	class="skeleton {className}" 
	style="width: {width}; height: {height}; border-radius: {borderRadius};"
></div>

<style>
	.skeleton {
		background-color: transparent;
		border: 1px dashed var(--latex-rule, var(--border-color));
		background-image: linear-gradient(
			90deg, 
			rgba(255, 255, 255, 0) 0, 
			rgba(255, 255, 255, 0.03) 24%, 
			rgba(255, 255, 255, 0.08) 58%, 
			rgba(255, 255, 255, 0)
		);
		background-size: 200% 100%;
		background-repeat: no-repeat;
		animation: shimmer 3s infinite linear;
		display: inline-block;
		opacity: 0.65;
	}

	:global(.dark) .skeleton {
		background-image: linear-gradient(
			90deg, 
			rgba(0, 0, 0, 0) 0, 
			rgba(255, 255, 255, 0.01) 20%, 
			rgba(255, 255, 255, 0.03) 60%, 
			rgba(0, 0, 0, 0)
		);
	}

	@keyframes shimmer {
		0% { background-position: -200% 0; }
		100% { background-position: 200% 0; }
	}
</style>
