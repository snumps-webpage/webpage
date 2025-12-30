<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data } = $props();
	let selectedSemester = $state('all');
	let isEditing = $state(false);

	let filteredActivities = $derived(
		selectedSemester === 'all' 
			? data.activities 
			: data.activities.filter(a => {
				const date = new Date(a.date);
				const year = date.getFullYear();
				const month = date.getMonth() + 1;
				// Match academic semester: 1st (Mar-Aug), 2nd (Sep-Feb next year)
				const sem = (month >= 3 && month <= 8) ? `${year}-1` : (month >= 9 ? `${year}-2` : `${year - 1}-2`);
				return sem === selectedSemester;
			})
	);
</script>

<div class="profile-container">
	{#if data.profile}
		<section class="profile-card">
			<div class="header">
				<h1>내 정보</h1>
				<button class="edit-toggle" onclick={() => isEditing = !isEditing}>
					{isEditing ? '취소' : '수정'}
				</button>
			</div>
			
			{#if isEditing}
				<form method="POST" action="?/update" use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							isEditing = false;
							alert('정보가 수정되었습니다.');
							await invalidateAll();
						} else {
							alert('수정 실패');
						}
					};
				}}>
					<div class="field">
						<label for="name">이름 (변경 불가)</label>
						<input id="name" type="text" value={data.profile.name} disabled />
						<span class="hint">이름 변경은 운영진에게 문의해주세요.</span>
					</div>

					<div class="field">
						<label for="phone">전화번호</label>
						<input id="phone" type="tel" name="phone" value={data.profile.phone} />
					</div>

					<div class="field">
						<label for="bio">자기소개</label>
						<textarea id="bio" name="bio" rows="3">{data.profile.bio}</textarea>
					</div>

					<div class="field">
						<label for="background">배경지식</label>
						<textarea id="background" name="background" rows="3">{data.profile.background}</textarea>
					</div>

					<button class="save-btn">저장하기</button>
				</form>
			{:else}
				<div class="info-view">
					<div class="info-item">
						<span class="label">이름</span>
						<span class="value">{data.profile.name}</span>
					</div>
					<div class="info-item">
						<span class="label">이메일</span>
						<span class="value">{data.profile.email}</span>
					</div>
					<div class="info-item">
						<span class="label">전화번호</span>
						<span class="value">{data.profile.phone}</span>
					</div>
					<div class="info-item">
						<span class="label">자기소개</span>
						<p class="value-text">{data.profile.bio || '-'}</p>
					</div>
					<div class="info-item">
						<span class="label">배경지식</span>
						<p class="value-text">{data.profile.background || '-'}</p>
					</div>
				</div>
			{/if}
		</section>

		<section class="activities-card">
			<div class="header">
				<h2>활동 내역</h2>
				<select bind:value={selectedSemester} class="semester-select">
					<option value="all">전체 활동</option>
					{#each data.semesters as sem}
						<option value={sem}>{sem}학기</option>
					{/each}
				</select>
			</div>

			<div class="table-container">
				{#if filteredActivities.length === 0}
					<p class="empty">활동 내역이 없습니다.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>날짜</th>
								<th>활동명</th>
								<th>종류</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredActivities as activity}
								<tr>
									<td class="date">{activity.date}</td>
									<td class="name">{activity.name}</td>
									<td><span class="tag">{activity.type}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.profile-container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
		display: grid;
		gap: 2rem;
	}

	section {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 1px 3px rgba(0,0,0,0.1);
		border: 1px solid #e5e7eb;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	h1, h2 { margin: 0; color: #1f2937; }
	h1 { font-size: 1.5rem; }
	h2 { font-size: 1.25rem; }

	.edit-toggle {
		background: transparent;
		border: 1px solid #d1d5db;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.field, .info-item {
		margin-bottom: 1.5rem;
	}

	label, .label {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		color: #6b7280;
		margin-bottom: 0.5rem;
	}

	input, textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 1rem;
	}

	input:disabled { background: #f9fafb; }

	.hint {
		font-size: 0.75rem;
		color: #9ca3af;
		margin-top: 0.25rem;
		display: block;
	}

	.save-btn {
		width: 100%;
		padding: 0.875rem;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
	}

	.value { font-size: 1rem; color: #111827; }
	.value-text { margin: 0; color: #374151; white-space: pre-wrap; line-height: 1.5; }

	.semester-select {
		padding: 0.5rem 2rem 0.5rem 1rem;
		border-radius: 6px;
		border: 1px solid #d1d5db;
		font-size: 0.9rem;
	}

	.table-container { overflow-x: auto; }
	
	table { width: 100%; border-collapse: collapse; text-align: left; }
	th { background: #f9fafb; padding: 0.75rem 1rem; font-weight: 600; color: #374151; }
	td { padding: 0.875rem 1rem; border-bottom: 1px solid #f3f4f6; }
	
	.tag {
		background: #f3f4f6;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
		color: #4b5563;
	}
	
	.empty { text-align: center; color: #9ca3af; padding: 2rem; }
</style>
