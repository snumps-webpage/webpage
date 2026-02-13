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
            <div class="success-message">
                <h3>수정이 완료되었습니다!</h3>
                <p>신청 정보가 성공적으로 반영되었습니다.</p>
                <div class="alert-actions mt-4">
                    <a href="/" class="btn home">홈으로 돌아가기</a>
                </div>
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
                    <input 
                        type="tel" 
                        id="phone" 
                        name="phone" 
                        value={data.application?.phone || ''} 
                        required 
                        placeholder="010-0000-0000" 
                        pattern="(\d&#123;11&#125;)|(\d&#123;3&#125;-\d&#123;4&#125;-\d&#123;4&#125;)"
                        title="11자리 숫자 또는 XXX-XXXX-XXXX 형식으로 입력해주세요."
                    />
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
        padding: 3rem;
        border-radius: 8px;
        box-shadow: var(--shadow);
        width: 100%;
        max-width: 500px;
        border: 1px solid var(--border-color);
    }

    h1 {
        font-size: 2rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: var(--text-primary);
        text-align: center;
        font-family: var(--font-display);
        font-style: italic;
    }

	.desc { color: var(--text-secondary); margin-bottom: 2.5rem; font-size: 1rem; text-align: center; font-family: var(--font-body); font-style: italic; }

    .form-group {
        margin-bottom: 1.75rem;
    }

    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 700;
        color: var(--text-secondary);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-family: var(--font-mono);
    }

    .form-group label span.req {
        color: var(--color-danger-text);
    }

    .form-group input, .form-group textarea {
        width: 100%;
        padding: 0.85rem;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 1.05rem;
        background: var(--bg-primary);
        color: var(--text-primary);
        box-sizing: border-box;
        font-family: var(--font-body);
        transition: border-color 0.2s;
    }

    .form-group input[id="email"], .form-group input[id="phone"] {
        font-family: var(--font-mono);
        font-size: 0.95rem;
    }

    .form-group input:focus, .form-group textarea:focus {
        outline: none;
        border-color: var(--text-primary);
    }

    .form-group input:disabled {
        background: var(--bg-secondary);
        color: var(--text-secondary);
        cursor: not-allowed;
        opacity: 0.6;
        border-style: dashed;
        -webkit-user-select: none;
        user-select: none;
    }

    .form-group .hint {
        font-size: 0.75rem;
        color: var(--text-secondary);
        margin-top: 0.4rem;
        display: block;
        font-style: italic;
        font-family: var(--font-body);
    }

    .btn-submit {
        width: 100%;
        padding: 1.25rem;
        background: var(--text-primary);
        color: var(--bg-primary);
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

	.btn-submit:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow);
	}

    .alert-actions { 
        display: flex; 
        flex-direction: column; 
        gap: 1rem; 
        max-width: 300px;
        margin: 0 auto;
    }

    .btn {
        width: 100%;
        padding: 1rem;
        border-radius: 4px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        user-select: none;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        box-sizing: border-box;
    }

    .home { background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); margin-top: 1rem; }
    .home:hover { border-color: var(--text-primary); }

    .btn-cancel-link {
        display: block;
        text-align: center;
        margin-top: 1.25rem;
        color: var(--text-secondary);
        font-size: 0.85rem;
        text-decoration: none;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .btn-cancel-link:hover { color: var(--text-primary); text-decoration: underline; }

    .success-message {
        text-align: center;
        padding: 2rem 0;
        color: var(--text-primary);
    }
    
    .success-message h3 {
        font-family: var(--font-display);
        color: var(--color-success-text);
        font-style: italic;
        font-size: 1.5rem;
        margin-bottom: 1rem;
    }

    .error {
        background: var(--color-danger-bg);
        color: var(--color-danger-text);
        padding: 1rem;
        border-radius: 4px;
        margin-bottom: 2rem;
        font-size: 0.9rem;
        text-align: center;
        font-family: var(--font-body);
        font-weight: 600;
    }

    .mt-4 { margin-top: 1.5rem; }

</style>
