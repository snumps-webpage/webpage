<script lang="ts">
	let { date = "29 NOV 2024" } = $props();
</script>

<span class="paper-side-mark" aria-hidden="true">SNUMPS @ {date}</span>
<div class="paper-symbol-bg" aria-hidden="true">
	<span>∫</span>
	<span>∑</span>
	<span>∂</span>
	<span>∀</span>
	<span>∃</span>
	<span>∴</span>
	<span>ℕ</span>
	<span>π</span>
	<span>∞</span>
	<span>∇</span>
	<span>⊂</span>
	<span>⇒</span>
	<span>≈</span>
	<span>⊕</span>
	<span>λ</span>
	<span>φ</span>
</div>

<style>
	.paper-side-mark {
		position: fixed;
		left: max(0.06rem, env(safe-area-inset-left));
		top: calc(var(--nav-height) + env(safe-area-inset-top) + 0.32rem);
		bottom: calc(0.75rem + env(safe-area-inset-bottom));
		display: flex;
		align-items: center;
		justify-content: center;
		transform: rotate(180deg);
		writing-mode: vertical-rl;
		font-family: var(--font-display);
		font-size: clamp(0.94rem, 1.35vw, 1.22rem);
		letter-spacing: 0.08em;
		color: var(--latex-side-mark);
		pointer-events: none;
		z-index: 65;
	}

	.paper-symbol-bg {
		position: fixed;
		inset: calc(var(--nav-height) + env(safe-area-inset-top) + 0.3rem) 0 calc(3.15rem + env(safe-area-inset-bottom)) 1.24rem;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		align-content: space-evenly;
		justify-items: center;
		row-gap: clamp(0.8rem, 2.8vh, 2rem);
		pointer-events: none;
		color: var(--latex-side-mark);
		opacity: 0.2;
		z-index: 1;
	}

	.paper-symbol-bg span {
		font-family: var(--font-math, var(--font-display));
		font-size: clamp(1.2rem, 2.35vw, 1.86rem);
		line-height: 1;
	}

	@media (max-width: 900px) {
		.paper-side-mark {
			left: max(0.04rem, env(safe-area-inset-left));
			top: calc(var(--nav-height) + env(safe-area-inset-top) + 0.25rem);
			bottom: calc(0.7rem + env(safe-area-inset-bottom));
			font-size: 0.98rem;
			letter-spacing: 0.06em;
			opacity: 0.95;
		}

		.paper-symbol-bg {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			opacity: 0.24;
			row-gap: 1.15rem;
		}

		.paper-symbol-bg span {
			font-size: 1.3rem;
		}

		.paper-symbol-bg span:nth-child(n + 13) {
			display: none;
		}
	}

	@media (max-width: 768px) {
		.paper-side-mark {
			left: max(0.02rem, env(safe-area-inset-left));
			bottom: calc(0.68rem + env(safe-area-inset-bottom));
			font-size: 0.92rem;
		}

		.paper-symbol-bg {
			opacity: 0.2;
		}
	}

	@media (max-width: 620px) {
		.paper-side-mark {
			display: block;
			left: max(0.01rem, env(safe-area-inset-left));
			bottom: calc(0.65rem + env(safe-area-inset-bottom));
			font-size: 0.86rem;
			letter-spacing: 0.05em;
			opacity: 0.92;
		}

		.paper-symbol-bg {
			opacity: 0.17;
			row-gap: 0.8rem;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.paper-symbol-bg span {
			font-size: 1.24rem;
		}

		.paper-symbol-bg span:nth-child(n + 9) {
			display: none;
		}
	}
</style>
