<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let step = $state(1);
	let ackInfo = $state(false);
	let ackDataPolicy = $state(false);
	let confirmName = $state('');
</script>

<svelte:head><title>회원 탈퇴 — SNUMPS</title></svelte:head>

<section class="withdraw-page">
	<h1>회원 탈퇴</h1>
	{#if form && 'error' in form}<p class="error">처리 실패: {('message' in form && form.message) || form.error}</p>{/if}

	<form method="POST" action="?/requestWithdrawal" use:enhance>
		<fieldset disabled={step < 1}>
			<legend>1단계 — 탈퇴 안내</legend>
			<p>탈퇴 시 회원 영역 이용이 즉시 중단됩니다. 신청 후 1개월 이내에는 다시 로그인해 철회할 수 있습니다.</p>
			<label><input type="checkbox" name="ackInfo" bind:checked={ackInfo} /> 안내를 확인했습니다</label>
			{#if step === 1}<button type="button" disabled={!ackInfo} onclick={() => (step = 2)}>다음</button>{/if}
		</fieldset>

		{#if step >= 2}
			<fieldset>
				<legend>2단계 — 데이터 처리 고지</legend>
				<p>
					신청 1개월 후 연락처·이메일 등 개인정보가 삭제 대상이 됩니다. 세미나·스터디 참여 기록에는
					이름·학과 수준의 정보만 남습니다. 회장단이 보존을 집행하면 삭제가 중단될 수 있습니다.
				</p>
				<label><input type="checkbox" name="ackDataPolicy" bind:checked={ackDataPolicy} /> 데이터 처리 방침을 확인했습니다</label>
				{#if step === 2}<button type="button" disabled={!ackDataPolicy} onclick={() => (step = 3)}>다음</button>{/if}
			</fieldset>
		{/if}

		{#if step >= 3}
			<fieldset>
				<legend>3단계 — 최종 확인</legend>
				<p>본인 확인을 위해 이름(<strong>{data.memberName}</strong>)을 정확히 입력해 주세요.</p>
				<input name="confirmName" bind:value={confirmName} placeholder="이름 입력" />
				<button type="submit" disabled={confirmName.trim() !== data.memberName}>탈퇴 신청</button>
			</fieldset>
		{/if}
	</form>

	<p class="note">주최 중인 스터디가 있으면 먼저 주최자를 전달해야 합니다.</p>
</section>

<style>
	.withdraw-page { max-width: 32rem; margin: 3rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1rem; }
	form { display: flex; flex-direction: column; gap: 1rem; }
	fieldset { border: 1px solid #8886; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem; }
	button { align-self: flex-start; padding: 0.35rem 1rem; cursor: pointer; }
	.error { color: #b3261e; }
	.note { font-size: 0.85rem; opacity: 0.7; }
</style>
