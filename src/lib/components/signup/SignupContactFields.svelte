<script lang="ts">
  let {
    title = "학번과 연락 정보",
    phone = $bindable(""),
    studentId = $bindable(""),
    background = $bindable(""),
    issues = {},
  } = $props();
</script>

<li class="paper-section">
  <p class="section-index">02 · 신청 정보</p>
  <h2 class="paper-section-title">{title}</h2>
  <div class="paper-field">
    <label for="studentId" class="paper-label"
      >학번 <span class="req">*</span></label
    >
    <input
      type="text"
      id="studentId"
      name="studentId"
      bind:value={studentId}
      required
      placeholder="2024-12345"
      pattern={"[0-9]{4}-?[0-9]{4,6}"}
      maxlength="24"
      title="학번을 2024-12345 형식으로 입력해주세요."
      inputmode="numeric"
      aria-invalid={Boolean(issues.studentId)}
      aria-describedby={issues.studentId ? "studentId-error" : undefined}
    />
    {#if issues.studentId}<small id="studentId-error" class="field-error"
        >{issues.studentId}</small
      >{/if}
  </div>
  <div class="paper-field">
    <label for="phone" class="paper-label"
      >전화번호 <span class="req">*</span></label
    >
    <input
      type="tel"
      id="phone"
      name="phone"
      bind:value={phone}
      required
      placeholder="010-0000-0000"
      maxlength="32"
      title="010-XXXX-XXXX 형식으로 입력해 주세요. 공백이나 하이픈 없이 입력해도 됩니다."
      inputmode="tel"
      autocomplete="tel"
      aria-invalid={Boolean(issues.phone)}
      aria-describedby={issues.phone ? "phone-error" : undefined}
    />
    {#if issues.phone}<small id="phone-error" class="field-error"
        >{issues.phone}</small
      >{/if}
  </div>
  <div class="paper-field">
    <label for="background" class="paper-label">배경지식</label>
    <textarea
      id="background"
      name="background"
      rows="5"
      bind:value={background}
      maxlength="2000"
      placeholder="관심 분야나 관련 경험을 적어주세요."
      aria-invalid={Boolean(issues.background)}
      aria-describedby={issues.background ? "background-error" : undefined}
    ></textarea>
    {#if issues.background}<small id="background-error" class="field-error"
        >{issues.background}</small
      >{/if}
  </div>
</li>

<style>
  .section-index {
    margin: 0 0 0.25rem;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.65rem;
  }
  input,
  textarea {
    border-color: var(--latex-muted);
  }
  .req {
    color: var(--latex-accent);
  }

  .field-error {
    color: var(--color-danger-text);
    font-size: 0.72rem;
  }
</style>
