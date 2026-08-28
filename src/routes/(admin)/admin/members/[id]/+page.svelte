<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const m = $derived(data.member);
</script>

<svelte:head><title>회원 상세 — SNUMPS Admin</title></svelte:head>

<section class="admin-editor">
	<h1>{m.name} <small>({m.status}{m.isAlumni ? ' · 동문' : ''}{m.isAdmin ? ' · 관리자' : ''})</small></h1>

	<form method="POST" action="?/updateMember" use:enhance>
		<h2>공개 정보</h2>
		<label>이름 <input name="name" value={m.name} /></label>
		<label>학과 <input name="department" value={m.department} /></label>
		<label>가입일 <input name="joinedAt" type="date" value={m.joinedAt ?? ''} /></label>
		<label>공개 연락처 <input name="publicContact" value={m.publicContact ?? ''} /></label>
		<label>프로젝트명 <input name="projectTitle" value={m.project?.title ?? ''} /></label>
		<label>프로젝트 URL <input name="projectUrl" value={m.project?.url ?? ''} /></label>
		<button>저장</button>
	</form>

	<form method="POST" action="?/setStatus" use:enhance>
		<h2>지위</h2>
		<select name="status">
			<option value="associate" selected={m.status === 'associate'}>준회원</option>
			<option value="regular" selected={m.status === 'regular'}>정회원</option>
		</select>
		<button>변경</button>
		<p class="note">정회원 승격 시 동문 지위 자동 부여 (박탈 이력 있으면 제외)</p>
	</form>

	<form method="POST" action="?/revokeAlumni" use:enhance>
		<h2>동문 지위 박탈 (유고)</h2>
		<label>사유 (필수) <input name="reason" required /></label>
		<button>박탈 집행</button>
	</form>

	<form method="POST" action="?/setRoles" use:enhance>
		<h2>직책 (한 줄에 하나, 예: 26-1 회장)</h2>
		<textarea name="roles" rows="4">{m.roles.map((r) => `${r.term} ${r.title}`).join('\n')}</textarea>
		<button>저장</button>
	</form>

	<form method="POST" action="?/setAdmin" use:enhance>
		<h2>관리자 권한</h2>
		<input type="hidden" name="isAdmin" value={m.isAdmin ? 'false' : 'true'} />
		<button>{m.isAdmin ? '권한 회수' : '권한 부여'}</button>
	</form>

	{#if data.privateInfo}
		<form method="POST" action="?/updatePrivateInfo" use:enhance>
			<h2>개인정보 🔒 (열람·수정 감사 기록됨)</h2>
			<label>이메일 <input name="email" value={data.privateInfo.email} /></label>
			<label>전화 <input name="phone" value={data.privateInfo.phone} /></label>
			<label>배경지식 <textarea name="background" rows="3">{data.privateInfo.background}</textarea></label>
			<button>저장</button>
		</form>
	{:else}
		<p>개인정보 없음 (익명화되었거나 미연결)</p>
	{/if}

	{#if m.status === 'withdrawn' && m.withdrawal}
		<section>
			<h2>탈퇴 유예</h2>
			<p>신청일: {m.withdrawal.requestedAt} · 보존 집행: {m.withdrawal.holdBy ? '됨' : '안 됨'}</p>
			{#if m.withdrawal.holdBy}
				<form method="POST" action="?/releaseWithdrawalHold" use:enhance>
					<button>보존 해제 (1개월 재기산)</button>
				</form>
			{:else}
				<form method="POST" action="?/holdWithdrawal" use:enhance>
					<button>정보 보존 집행</button>
				</form>
			{/if}
		</section>
	{/if}
</section>

<style>
	.admin-editor { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1.5rem; }
	form { display: flex; flex-direction: column; gap: 0.5rem; border: 1px solid #8884; padding: 1rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; }
	.note { font-size: 0.85rem; opacity: 0.7; margin: 0; }
	button { align-self: flex-start; padding: 0.35rem 1rem; cursor: pointer; }
</style>
