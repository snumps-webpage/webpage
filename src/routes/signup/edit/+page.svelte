<script lang="ts">
	let { data, form } = $props();
</script>

<div class="container">
	<div class="card">
		<h1>신청 정보 수정</h1>
		
        <p class="desc no-sel">
            제출하신 가입 신청 정보를 수정할 수 있습니다.<br>
            수정 후에도 기존 신청 시점의 타임스탬프는 유지됩니다.
        </p>

        {#if form?.error}
            <div class="error">{form.error}</div>
        {/if}

        {#if form?.success}
            <div class="success-box no-sel">
                <h2>✅ 수정 완료</h2>
                <p>신청 정보가 성공적으로 수정되었습니다.</p>
                <a href="/" class="btn-home">메인으로 가기</a>
            </div>
        {:else}
            <form method="POST">
                <input type="hidden" name="id" value={data.application?.id} />

                <div class="form-group no-sel">
                    <label for="name">이름</label>
                    <input type="text" id="name" value={data.parsedInfo.name} disabled />
                    <span class="hint">SNU 계정 기반</span>
                </div>

                <div class="form-group no-sel">
                    <label for="department">학과</label>
                    <input type="text" id="department" value={data.parsedInfo.department} disabled />
                    <span class="hint">SNU 계정 기반</span>
                </div>

                <div class="form-group no-sel">
                    <label for="email">이메일</label>
                    <input type="text" id="email" value={data.user?.email} disabled />
                    <span class="hint">로그인된 계정</span>
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

    .form-group input:disabled {
        background: var(--btn-secondary);
        color: var(--text-secondary);
        cursor: not-allowed;
        opacity: 0.7;
        border-style: dashed;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }

    .form-group .hint {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
        display: block;
        font-style: italic;
    }

    .btn-submit {
        width: 100%;
        padding: 1rem;
        background: var(--text-primary);
        color: var(--bg-primary);
        border: none;
        border-radius: 4px;
        font-size: 1.1rem;
        font-weight: 600;
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
</style>
