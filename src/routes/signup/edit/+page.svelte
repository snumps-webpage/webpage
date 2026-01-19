<script lang="ts">
	let { data, form } = $props();
</script>

<div class="container">
	<div class="card">
		<h1>신청 정보 수정</h1>
		
        <p class="desc">
            제출하신 가입 신청 정보를 수정할 수 있습니다.<br>
            수정 후에도 기존 신청 시점의 타임스탬프는 유지됩니다.
        </p>

        {#if form?.error}
            <div class="error">{form.error}</div>
        {/if}

        {#if form?.success}
            <div class="success-box">
                <h2>✅ 수정 완료</h2>
                <p>신청 정보가 성공적으로 수정되었습니다.</p>
                <a href="/" class="btn-home">메인으로 가기</a>
            </div>
        {:else}
            <form method="POST">
                <input type="hidden" name="id" value={data.application?.id} />

                <div class="form-group">
                    <label for="email">이메일</label>
                    <input type="text" id="email" value={data.user?.email} disabled />
                    <span class="hint">로그인된 계정입니다.</span>
                </div>

                <div class="form-group">
                    <label for="name">이름 <span class="req">*</span></label>
                    <input type="text" id="name" name="name" value={data.application?.name || data.user?.name} required placeholder="홍길동" />
                </div>

                <div class="form-group">
                    <label for="department">학과 <span class="req">*</span></label>
                    <input type="text" id="department" name="department" value={data.application?.department || ''} required placeholder="수리과학부" />
                </div>

                <div class="form-group">
                    <label for="phone">전화번호 <span class="req">*</span></label>
                    <input type="tel" id="phone" name="phone" value={data.application?.phone || ''} required placeholder="010-0000-0000" />
                </div>

                <div class="form-group">
                    <label for="background">배경지식</label>
                    <textarea id="background" name="background" rows="4" placeholder="관심 분야나 관련 경험을 적어주세요.">{data.application?.background || ''}</textarea>
                </div>

                <button type="submit" class="btn-submit">
                    수정하기
                </button>
                <a href="/" class="btn-cancel-link">취소</a>
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
        background: var(--bg-primary);
        padding: 2rem 1rem;
    }

    .card {
        background: var(--bg-secondary);
        padding: 2.5rem;
        border-radius: 16px;
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
    }

	.desc { color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.95rem; text-align: center; }

    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.9rem;
    }

    .form-group label span.req {
        color: var(--color-danger-text);
    }

    .form-group input, .form-group textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 1rem;
        background: var(--bg-primary);
        color: var(--text-primary);
        box-sizing: border-box;
    }

    .form-group input:focus, .form-group textarea:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .form-group .hint {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
        display: block;
    }

    .btn-submit {
        width: 100%;
        padding: 1rem;
        background: var(--brand-gradient);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
    }

    .btn-submit:active {
        transform: scale(0.98);
    }

	.btn-submit:hover {
		opacity: 0.9;
	}

    .btn-home {
        display: inline-block;
        margin-top: 1.5rem;
        padding: 0.75rem 1.5rem;
        background: var(--text-primary);
        color: var(--bg-primary);
        text-decoration: none;
        border-radius: 8px;
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
        color: #10b981;
        margin-bottom: 1rem;
    }

    .error {
        background: var(--color-danger-bg);
        color: var(--color-danger-text);
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        text-align: center;
    }
</style>
