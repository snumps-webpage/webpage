<script lang="ts">
	import type { PageData } from './$types';
	
	let { data, form } = $props();
</script>

<div class="container">
	<div class="card">
		<h1>회원가입 신청</h1>
		
		{#if data.pending}
			<div class="status-box pending">
				<h2>⏳ 가입 승인 대기중</h2>
				<p>가입 신청이 접수되었습니다. 관리자 승인을 기다려주세요.</p>
				<p>승인이 완료되면 메인 페이지로 접근할 수 있습니다.</p>
			</div>
		{:else}
			<p class="desc">
				SNUMPS 활동을 위해 추가 정보가 필요합니다.<br>
				입력하신 정보는 동아리 운영 목적으로만 사용됩니다.
			</p>

			{#if form?.error}
				<div class="error">{form.error}</div>
			{/if}

			<form method="POST">
				<div class="form-group">
					<label for="email">이메일</label>
					<input type="text" id="email" value={data.user?.email} disabled />
					<span class="hint">로그인된 계정입니다.</span>
				</div>

				<div class="form-group">
					<label for="name">이름 <span class="req">*</span></label>
					<input type="text" id="name" name="name" value={data.user?.name} required placeholder="홍길동" />
				</div>

				<div class="form-group">
					<label for="department">학과 <span class="req">*</span></label>
					<input type="text" id="department" name="department" required placeholder="수리과학부" />
				</div>

				<div class="form-group">
					<label for="phone">전화번호 <span class="req">*</span></label>
					<input type="tel" id="phone" name="phone" required placeholder="010-0000-0000" />
				</div>

				<div class="form-group">
					<label for="bio">자기소개</label>
					<textarea id="bio" name="bio" rows="3" placeholder="간단한 자기소개를 입력해주세요."></textarea>
				</div>

				<div class="form-group">
					<label for="background">배경지식</label>
					<textarea id="background" name="background" rows="3" placeholder="관심 분야나 관련 경험을 적어주세요."></textarea>
				</div>

				<div class="agreement">
					<label>
						<input type="checkbox" name="agreement" required />
						<span>[필수] 개인정보 수집 및 이용에 동의합니다.</span>
					</label>
					<div class="terms">
						수집 항목: 이름, 학과, 전화번호, 이메일<br>
						수집 목적: 동아리 회원 관리 및 연락<br>
						보유 기간: 동아리 탈퇴 시까지
					</div>
				</div>

				<button type="submit" class="submit-btn">가입 신청하기</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: #f3f4f6;
	}

	.card {
		background: white;
		width: 100%;
		max-width: 500px;
		padding: 2.5rem;
		border-radius: 16px;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h1 {
		margin: 0 0 0.5rem;
		color: #111827;
		text-align: center;
	}

	.desc {
		text-align: center;
		color: #6b7280;
		margin-bottom: 2rem;
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.form-group {
		margin-bottom: 1.25rem;
	}

	label {
		display: block;
		font-size: 0.9rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	.req {
		color: #dc2626;
	}

	input, textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	input:focus, textarea:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	input:disabled {
		background: #f9fafb;
		color: #6b7280;
	}

	.hint {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.8rem;
		color: #9ca3af;
	}

	.agreement {
		margin: 2rem 0;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 8px;
	}

	.agreement label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		margin-bottom: 0.5rem;
	}

	.terms {
		font-size: 0.8rem;
		color: #6b7280;
		padding-left: 1.75rem;
		line-height: 1.4;
	}

	.submit-btn {
		width: 100%;
		padding: 0.875rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.submit-btn:hover {
		opacity: 0.9;
	}

	.error {
		background: #fee2e2;
		color: #dc2626;
		padding: 0.75rem;
		border-radius: 6px;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
		text-align: center;
	}

	.status-box.pending {
		text-align: center;
		padding: 2rem;
		background: #fff7ed;
		border: 1px solid #ffedd5;
		border-radius: 8px;
		color: #9a3412;
	}

	.status-box h2 {
		margin-top: 0;
		font-size: 1.25rem;
		margin-bottom: 1rem;
	}
</style>
