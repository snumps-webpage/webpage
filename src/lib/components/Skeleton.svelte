<script lang="ts">
	interface Props {
		width?: string;
		height?: string;
		borderRadius?: string;
		className?: string;
	}

	let { width = '100%', height = '1rem', borderRadius = '4px', className = '' }: Props = $props();
</script>

<div 
	class="skeleton {className}" 
	style="width: {width}; height: {height}; border-radius: {borderRadius};"
></div>

<style>
	.skeleton {
		background-color: var(--border-color);
		background-image: linear-gradient(
			90deg, 
			rgba(255, 255, 255, 0) 0, 
			rgba(255, 255, 255, 0.2) 20%, 
			rgba(255, 255, 255, 0.5) 60%, 
			rgba(255, 255, 255, 0)
		);
		background-size: 200% 100%;
		background-repeat: no-repeat;
		animation: shimmer 2s infinite linear;
		display: inline-block;
	}

	:global(.dark) .skeleton {
		background-color: #334155; /* Darker base for dark mode */
		background-image: linear-gradient(
			90deg, 
			rgba(255, 255, 255, 0) 0, 
			rgba(255, 255, 255, 0.05) 20%, 
			rgba(255, 255, 255, 0.1) 60%, 
			rgba(255, 255, 255, 0)
		);
	}

	@keyframes shimmer {
		0% { background-position: -200% 0; }
		100% { background-position: 200% 0; }
	}
</style>