<script lang="ts">
  import { tick } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { v7 as uuidv7 } from "uuid";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { uploadAdminFile } from "$lib/client/api";
  import { uploadFileProblem, uploadLimitMb } from "$lib/domain/uploads";
  import type { BroadcastPreview } from "$lib/server/mail/broadcast/send";
  import type { MailBroadcast } from "$lib/server/data/schemas";

  let { data } = $props();
  const recent = $derived(data.recent as MailBroadcast[]);

  const PURPOSE = "broadcast-eml";
  const accept = ".eml,message/rfc822";
  const limitMb = uploadLimitMb(PURPOSE);

  const PROBLEMS: Record<string, string> = {
    "bad-key": "업로드 경로가 올바르지 않습니다. 파일을 다시 올려 주세요.",
    missing: "올린 파일을 찾지 못했습니다. 다시 올려 주세요.",
    "too-large": `${limitMb}MB를 넘는 파일은 올릴 수 없습니다.`,
    unreadable: "메일 파일(.eml)로 읽을 수 없습니다.",
    "no-subject": "제목이 없는 메일입니다.",
    "no-body": "본문이 없는 메일입니다.",
    duplicate: "이미 발송된 메일입니다.",
    "no-recipients": "받을 회원이 없습니다.",
    "send-failed": "시험 발송에 실패했습니다.",
  };
  const STATUS: Record<string, string> = {
    sent: "발송 완료",
    partial: "일부 실패",
    failed: "실패",
    sending: "발송 중",
  };

  let input = $state<HTMLInputElement | null>(null);
  let previewForm = $state<HTMLFormElement | null>(null);
  let s3Key = $state("");
  let preview = $state<BroadcastPreview | null>(null);
  let existing = $state<MailBroadcast | null>(null);
  let uploading = $state(false);
  let busy = $state<"preview" | "test" | "send" | null>(null);
  let errorMessage = $state<string | null>(null);
  let testNotice = $state<string | null>(null);
  let sendUnknown = $state(false);
  let duplicateSeen = $state(false);
  let sendResult = $state<{ row: MailBroadcast; skipped: number } | null>(null);

  const problemText = (code: unknown) =>
    PROBLEMS[String(code)] ?? "처리하지 못했습니다.";
  const when = (iso: string) => new Date(iso).toLocaleString("ko-KR");

  const alreadySent = $derived(
    existing?.status === "sent" || existing?.status === "partial",
  );
  const blocked = $derived(
    alreadySent || existing?.status === "sending" || duplicateSeen,
  );

  function reset() {
    preview = null;
    existing = null;
    errorMessage = null;
    testNotice = null;
    sendResult = null;
    sendUnknown = false;
    duplicateSeen = false;
  }

  async function onPick() {
    reset();
    s3Key = "";
    const picked = input?.files?.[0];
    if (!picked) return;
    // 일부 브라우저는 .eml의 type을 비워 둔다.
    const file = picked.type
      ? picked
      : new File([picked], picked.name, { type: "message/rfc822" });
    const problem = uploadFileProblem(PURPOSE, file);
    if (problem) {
      errorMessage =
        problem === "size"
          ? PROBLEMS["too-large"]
          : problem === "empty"
            ? "빈 파일은 올릴 수 없습니다."
            : "메일 파일(.eml)만 올릴 수 있습니다.";
      return;
    }
    uploading = true;
    try {
      const uploaded = await uploadAdminFile(file, PURPOSE, uuidv7());
      s3Key = uploaded.s3Key;
      // hidden 입력에 값이 반영된 뒤 미리보기를 제출한다.
      await tick();
      previewForm?.requestSubmit();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "파일을 업로드하지 못했습니다.";
    } finally {
      uploading = false;
    }
  }

  type Result = { type: string; data?: Record<string, unknown> };

  const handle =
    (op: "preview" | "test" | "send") =>
    ({ cancel }: { cancel: () => void }) => {
      // enhance는 defaultPrevented를 보지 않으므로 확인은 여기서 cancel()로 막는다.
      if (
        op === "send" &&
        (!preview || !confirm(`${preview.recipientCount}명에게 발송합니다`))
      ) {
        cancel();
        return;
      }
      busy = op;
      errorMessage = null;
      return async ({ result }: { result: Result }) => {
        busy = null;
        const d = result.data ?? {};
        if (result.type === "success") {
          if (op === "preview") {
            preview = d.preview as BroadcastPreview;
            existing = preview.existing;
          } else if (op === "test") {
            testNotice = "내게 시험 발송했습니다.";
          } else {
            sendResult = {
              row: d.row as MailBroadcast,
              skipped: Number(d.skipped ?? 0),
            };
            await invalidateAll();
          }
        } else if (result.type === "failure") {
          if (d.error === "SERVICE_UNAVAILABLE") {
            // 발송 결과를 기록하지 못했을 수 있다: 행은 sending으로 남는다.
            if (op === "send") sendUnknown = true;
            else
              errorMessage = "일시적인 오류입니다. 잠시 뒤 다시 시도해 주세요.";
          } else errorMessage = problemText(d.error);
          if (d.error === "duplicate") {
            duplicateSeen = true;
            if (d.existing) existing = d.existing as MailBroadcast;
          }
        } else {
          errorMessage = "처리하지 못했습니다.";
        }
      };
    };
</script>

<svelte:head><title>외부 메일 전체 공지 · SNUMPS Admin</title></svelte:head>

<article class="paper-document mail-paper">
  <ManuscriptHeader
    title="외부 메일 전체 공지"
    subtitle="Broadcast an uploaded .eml"
    figure={MANUSCRIPT.FIGURES.ADMIN}
  />
  <AdminSectionNav />
  <p class="scope-note">
    Gmail에서 내려받은 <code>.eml</code> 파일을 올리면 수신 동의한 회원 전원에게 Bcc로
    발송합니다. 미리보기와 내게 시험 발송으로 확인한 뒤 전체 발송하세요.
  </p>

  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}

  <h2 class="section-title">1. 파일 선택</h2>
  <label>
    <span class="paper-label">.eml 파일 (최대 {limitMb}MB)</span>
    <input
      bind:this={input}
      type="file"
      {accept}
      disabled={uploading || busy !== null}
      onchange={onPick}
    />
  </label>
  {#if uploading}<p class="scope-note" role="status">업로드 중…</p>{/if}

  <form
    bind:this={previewForm}
    method="POST"
    action="?/preview"
    use:enhance={handle("preview")}
  >
    <input type="hidden" name="s3Key" value={s3Key} />
  </form>

  {#if preview}
    <h2 class="section-title">2. 미리보기</h2>
    <ul class="card-list">
      <li>
        <h3>{preview.subject}</h3>
        <p class="description">수신자 {preview.recipientCount}명</p>
        {#if preview.attachments.length > 0}
          <p class="subject-preview">
            <span class="paper-label">첨부</span>
            {#each preview.attachments as a, i (i)}
              <span class="badge"
                >{a.filename ?? "(이름 없음)"}{a.inline
                  ? " · 본문 포함"
                  : ""}</span
              >
            {/each}
          </p>
        {/if}
        {#if preview.html}
          <iframe sandbox="" srcdoc={preview.html} title="미리보기"></iframe>
        {:else}
          <pre class="text-preview">{preview.text}</pre>
        {/if}
      </li>
    </ul>

    {#if sendUnknown}
      <p class="error" role="alert">
        결과 불명 — Gmail 보낸편지함을 확인하세요. 같은 파일은 다시 보낼 수
        없습니다.
      </p>
    {/if}
    {#if existing && alreadySent}
      <p class="error" role="alert">
        이미 발송됨 ({when(existing.startedAt)} · {existing.sentBy} · {STATUS[
          existing.status
        ]})
      </p>
    {:else if existing?.status === "sending"}
      <p class="error" role="alert">
        결과 불명 — Gmail 보낸편지함을 확인하세요
      </p>
    {:else if existing?.status === "failed"}
      <p class="notice" role="status">
        이전 발송이 실패해 다시 보낼 수 있습니다
      </p>
    {/if}

    {#if testNotice}<p class="notice" role="status">{testNotice}</p>{/if}
    {#if sendResult?.row.status === "failed"}
      <p class="error" role="alert">
        발송에 실패했습니다. 다시 보내려면 파일을 다시 올려 주세요.
      </p>
    {/if}
    {#if sendResult}
      <p class="notice" role="status">
        {STATUS[sendResult.row.status]} · 성공 {sendResult.row.batchesSent}묶음
        / 실패 {sendResult.row.batchesFailed}묶음
        {#if sendResult.skipped >= 1}
          · 주소 형식 문제로 {sendResult.skipped}명 제외{/if}
      </p>
    {/if}

    <div class="row-actions">
      <form method="POST" action="?/test" use:enhance={handle("test")}>
        <input type="hidden" name="s3Key" value={s3Key} />
        <button class="paper-btn" type="submit" disabled={busy !== null}
          >{busy === "test" ? "발송 중…" : "내게 시험 발송"}</button
        >
      </form>
      <form method="POST" action="?/send" use:enhance={handle("send")}>
        <input type="hidden" name="s3Key" value={s3Key} />
        <button
          class="paper-btn primary"
          type="submit"
          disabled={busy !== null || blocked || sendUnknown || !!sendResult}
          >{busy === "send" ? "발송 중…" : "전체 발송"}</button
        >
      </form>
    </div>
  {/if}

  <h2 class="section-title">최근 발송 (20건)</h2>
  {#if recent.length === 0}
    <p class="scope-note">발송 기록이 없습니다.</p>
  {:else}
    <table class="recent">
      <thead>
        <tr
          ><th>제목</th><th>보낸 사람</th><th>시각</th><th>수신자</th><th
            >상태</th
          ></tr
        >
      </thead>
      <tbody>
        {#each recent as r (r.id)}
          <tr>
            <td>{r.subject}</td>
            <td>{r.sentBy}</td>
            <td>{when(r.startedAt)}</td>
            <td>{r.recipientCount}명</td>
            <td><span class="badge">{STATUS[r.status] ?? r.status}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</article>

<style>
  .mail-paper {
    width: min(100%, 920px);
  }
  .scope-note {
    margin: 0 0 1rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.7;
  }
  .section-title {
    margin: 1.4rem 0 0.7rem;
    font-size: 1.05rem;
    font-weight: 600;
  }
  .notice {
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--latex-rule);
    font-size: 0.78rem;
  }
  .error {
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--color-danger-text, #b00);
    color: var(--color-danger-text, #b00);
    font-size: 0.78rem;
  }
  .card-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.8rem;
  }
  .card-list > li {
    padding: 0.9rem;
    border: 1px solid var(--latex-rule);
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .description {
    margin: 0.2rem 0 0;
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  .subject-preview {
    margin: 0.6rem 0 0;
    font-size: 0.8rem;
  }
  .subject-preview .paper-label {
    margin-right: 0.4rem;
  }
  .subject-preview .badge {
    margin-right: 0.3rem;
  }
  .badge {
    padding: 0.15rem 0.45rem;
    border: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.55rem;
  }
  iframe {
    width: 100%;
    height: 24rem;
    margin-top: 0.7rem;
    border: 1px solid var(--latex-rule);
    background: #fff;
  }
  .text-preview {
    margin: 0.7rem 0 0;
    white-space: pre-wrap;
    font-size: 0.78rem;
  }
  .row-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }
  .row-actions form {
    margin: 0;
  }
  .recent {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.74rem;
  }
  .recent th,
  .recent td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--latex-rule);
    text-align: left;
  }
</style>
