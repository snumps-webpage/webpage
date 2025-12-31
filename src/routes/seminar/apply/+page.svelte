<script lang="ts">
    import { enhance } from '$app/forms';
    let { form } = $props();
</script>

<div class="container">
    <h1>세미나 개설 신청</h1>
    <p class="desc">회원 누구나 자유롭게 세미나를 제안하고 개설할 수 있습니다.</p>
    
    {#if form?.success}
        <div class="success-message">
            <h3>✅ 신청이 완료되었습니다!</h3>
            <p>관리자 검토 후 결과가 이메일로 전송됩니다.</p>
            <a href="/" class="btn home">홈으로 돌아가기</a>
        </div>
    {:else}
        <form method="POST" use:enhance>
            {#if form?.error}
                <div class="error-banner">{form.error}</div>
            {/if}

            <div class="field">
                <label for="title">세미나 주제 (Title)</label>
                <input type="text" id="title" name="title" required placeholder="예: 양자역학 입문 세미나" />
            </div>

            <div class="field">
                <label for="date">예상 시작일</label>
                <input type="date" id="date" name="date" required />
            </div>

            <div class="field">
                <label for="type">활동 종류</label>
                <input type="text" id="type" value="Seminar" disabled class="disabled-input" />
                <span class="hint">세미나 신청 페이지에서는 종류가 'Seminar'로 고정됩니다.</span>
            </div>

            <button class="btn submit">신청하기</button>
        </form>
    {/if}
</div>

<style>
    .container {
        max-width: 600px;
        margin: 3rem auto;
        padding: 2rem;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    h1 { margin: 0 0 0.5rem 0; color: #111827; }
    .desc { color: #6b7280; margin-bottom: 2rem; }

    .field { margin-bottom: 1.5rem; }
    
    label { 
        display: block; 
        margin-bottom: 0.5rem; 
        font-weight: 600; 
        color: #374151;
    }

    input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 1rem;
    }

    .disabled-input {
        background: #f3f4f6;
        color: #6b7280;
    }

    .hint {
        font-size: 0.8rem;
        color: #9ca3af;
        margin-top: 0.25rem;
        display: block;
    }

    .btn {
        width: 100%;
        padding: 0.875rem;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        transition: opacity 0.2s;
        text-align: center;
        text-decoration: none;
        display: inline-block;
    }

    .submit { background: #667eea; color: white; }
    .submit:hover { opacity: 0.9; }
    
    .home { background: #f3f4f6; color: #374151; margin-top: 1rem; }

    .error-banner {
        background: #fee2e2;
        color: #991b1b;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
    }

    .success-message {
        text-align: center;
        padding: 2rem 0;
    }
</style>
