<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const on = $derived(data.mailPrefs.announcements !== false);
</script>

<svelte:head><title>메일 수신 설정 — SNUMPS</title></svelte:head>

<section class="settings-page">
	<h1>공지 메일 수신 설정</h1>
	<p>세미나 개설 등 전체 공지 메일의 수신 여부를 설정합니다.</p>
	<p>현재 상태: <strong>{on ? '수신 중' : '수신 안 함'}</strong></p>
	<form method="POST" action="?/setMailPref" use:enhance>
		<input type="hidden" name="type" value="announcements" />
		<input type="hidden" name="enabled" value={on ? 'false' : 'true'} />
		<button>{on ? '수신 해제' : '다시 수신'}</button>
	</form>
</section>

<style>
	.settings-page { max-width: 28rem; margin: 3rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
	button { align-self: flex-start; padding: 0.4rem 1.2rem; cursor: pointer; }
</style>
