<script lang="ts">
  let { name = "", department = "", email = "" } = $props();
</script>

<li class="paper-section account-metadata">
  <p class="section-index">01 · 신청 계정</p>
  <h2 class="paper-section-title">이 계정으로 신청합니다</h2>
  <dl>
    <div>
      <dt>이름</dt>
      <dd>{name || "계정 정보 확인 필요"}</dd>
    </div>
    <div>
      <dt>학과</dt>
      <dd>{department || "계정 정보 확인 필요"}</dd>
    </div>
    <div>
      <dt>이메일</dt>
      <dd>{email}</dd>
    </div>
  </dl>
  <p class="paper-hint">
    학교 Google 계정 정보입니다. 신청자의 이름과 학과는 이 계정에서 확인합니다.
  </p>
</li>

<style>
  .section-index {
    margin: 0 0 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--latex-muted);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem 1.5rem;
    margin: 0;
  }
  dl > div:last-child {
    grid-column: 1/-1;
  }
  dt {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--latex-muted);
  }
  dd {
    margin: 0.15rem 0 0;
    overflow-wrap: anywhere;
    font-size: 0.95rem;
  }
</style>
