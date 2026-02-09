<script lang="ts">
	let { data, form } = $props();
</script>

<div class="container">
	<div class="card">
		<h1>회원가입 신청</h1>
		
		{#if data.pending}
			<div class="status-box pending">
				<h2>⏳ 가입 승인 대기중</h2>
				<p>가입 신청이 이미 접수되었습니다. 관리자 승인을 기다려주세요.</p>
                <div class="alert-actions mt-4">
                    <a href="/wait" class="btn-home">대기 페이지로 가기</a>
                </div>
			</div>
		{:else}
			<p class="desc">
				SNUMPS 활동을 위해 추가 정보가 필요합니다.<br>
				입력하신 정보는 동아리 운영 목적으로만 사용됩니다.
			</p>

			{#if form?.error}
				<div class="error">{form.error}</div>
			{/if}

			{#if form?.success}
				<div class="success-box">
					<h2>✅ 신청 완료</h2>
					<p>가입 신청이 성공적으로 접수되었습니다. 관리자 승인 후 대시보드 이용이 가능합니다.</p>
					<a href="/" class="btn-home">메인으로 가기</a>
				</div>
			{:else}
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
						<label for="background">배경지식</label>
						<textarea id="background" name="background" rows="4" placeholder="관심 분야나 관련 경험을 적어주세요."></textarea>
					</div>

					<div class="agreement">
						<label class="checkbox-container">
							<input type="checkbox" name="agreement" required />
							<span class="checkmark"></span>
							개인정보 수집 및 이용에 동의합니다. (필수)
						</label>
					</div>

					<button type="submit" class="btn-submit">가입 신청하기</button>
                    <a href="/" class="btn-cancel-link">취소</a>
				</form>
			{/if}
		{/if}
	</div>
</div>

<style>
    .container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-primary);
        padding: 2rem 1rem;
    }

    .card {
        background: var(--bg-secondary);
        padding: 2.5rem;
        border-radius: 8px; /* Sharper */
        box-shadow: var(--shadow);
        width: 100%;
        max-width: 500px;
        border: 1px solid var(--border-color);
    }

    h1 {
        font-size: 1.75rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        color: var(--text-primary);
        text-align: center;
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
    }

	.desc { color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.95rem; text-align: center; font-family: "Inter", "Noto Sans KR", sans-serif; }

    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 700;
        color: var(--text-primary);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .form-group label span.req {
        color: var(--color-danger-text);
    }

    .form-group input, .form-group textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 1rem;
        background: var(--bg-primary);
        color: var(--text-primary);
        box-sizing: border-box;
        font-family: "Inter", "Noto Sans KR", sans-serif;
    }

    .form-group input[id="email"], .form-group input[id="phone"] {
        font-family: var(--font-mono);
        font-size: 0.95rem;
    }

    .form-group input:focus, .form-group textarea:focus {
        outline: none;
        border-color: var(--text-primary);
        box-shadow: 0 0 0 1px var(--text-primary);
    }

    .form-group .hint {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
        display: block;
        font-style: italic;
    }

    .agreement {
        margin: 2rem 0;
    }

    .checkbox-container {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        font-size: 0.95rem;
        color: var(--text-primary);
        position: relative;
        padding-left: 35px;
        user-select: none;
        font-family: "Inter", "Noto Sans KR", sans-serif;
    }

    .checkbox-container input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
        height: 0;
        width: 0;
    }

    .checkmark {
        position: absolute;
        top: 0;
        left: 0;
        height: 25px;
        width: 25px;
        background-color: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
    }

    .checkbox-container:hover input ~ .checkmark {
        background-color: var(--btn-secondary);
    }

    .checkbox-container input:checked ~ .checkmark {
        background-color: var(--text-primary);
        border-color: var(--text-primary);
    }

    .checkmark:after {
        content: "";
        position: absolute;
        display: none;
    }

    .checkbox-container input:checked ~ .checkmark:after {
        display: block;
    }

    .checkbox-container .checkmark:after {
        left: 9px;
        top: 5px;
        width: 5px;
        height: 10px;
        border: solid var(--bg-primary);
        border-width: 0 3px 3px 0;
        transform: rotate(45deg);
    }

    .btn-submit {
        width: 100%;
        padding: 1rem;
        background: var(--text-primary);
        color: var(--bg-primary);
        border: none;
        border-radius: 4px;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
    }

    .btn-submit:active {
        transform: scale(0.98);
    }

	.btn-submit:hover {
		opacity: 0.9;
	}

    .status-box.pending {
        background: var(--color-warning-bg);
        color: var(--color-warning-text);
        padding: 2rem;
        border-radius: 8px;
        text-align: center;
        border: 1px solid var(--border-color);
    }

    .status-box h2 {
        margin-top: 0;
        font-size: 1.25rem;
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
    }

    .btn-home {
        display: inline-block;
        margin-top: 1.5rem;
        padding: 0.75rem 1.5rem;
        background: var(--text-primary);
        color: var(--bg-primary);
        text-decoration: none;
        border-radius: 4px;
        font-weight: 600;
    }

    .btn-cancel-link {
        display: block;
        text-align: center;
        margin-top: 1rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
        text-decoration: underline;
    }

    .success-box {
        text-align: center;
        padding: 2rem 0;
    }

    .success-box h2 {
        color: var(--color-success-text);
        margin-bottom: 1rem;
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
    }

    .error {
        background: var(--color-danger-bg);
        color: var(--color-danger-text);
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        text-align: center;
    }

    .mt-4 {
        margin-top: 1rem;
    }
</style>

