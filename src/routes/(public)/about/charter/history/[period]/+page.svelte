<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>회칙 이력 — SNUMPS</title></svelte:head>

<section class="doc-page">
	<h1>회칙 이력 — {page.params.period}</h1>
	<blockquote>⚠️ 콘텐츠 이주 대기 — 회칙 개정본은 데이터 이주 트랙 P3에서 게시됩니다.</blockquote>
	<p><a href="/about/charter">현행 회칙으로</a></p>
</section>

<style>
	.doc-page { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
</style>
