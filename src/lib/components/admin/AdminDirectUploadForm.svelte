<script lang="ts">
  import { dev } from "$app/environment";
  import { v7 as uuidv7 } from "uuid";
  import { uploadAdminFile } from "$lib/client/api";
  import type { UploadPurpose } from "$lib/domain/api";

  let {
    recordId,
    action,
    inputName,
    accept,
    label,
    imagePurpose,
    documentPurpose = null,
    issue = null,
    buttonLabel,
  }: {
    recordId: string;
    action: string;
    inputName: string;
    accept: string;
    label: string;
    imagePurpose: Extract<UploadPurpose, "seminar-photo" | "study-photo" | "gallery-photo">;
    documentPurpose?: Extract<UploadPurpose, "seminar-material"> | null;
    issue?: string | null;
    buttonLabel: string;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let uploading = $state(false);
  let clientError = $state<string | null>(null);
  let readyToRegister = false;

  const addHidden = (form: HTMLFormElement, name: string, value: string) => {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = name;
    field.value = value;
    form.append(field);
  };

  async function submit(event: SubmitEvent) {
    if (dev || readyToRegister) return;
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const file = input?.files?.[0];
    if (!file) {
      clientError = "업로드할 파일을 선택해 주세요.";
      return;
    }
    const purpose = file.type === "application/pdf" ? documentPurpose : imagePurpose;
    if (!purpose) {
      clientError = "이 화면에서는 이미지 파일만 등록할 수 있습니다.";
      return;
    }
    uploading = true;
    clientError = null;
    try {
      const uploaded = await uploadAdminFile(file, purpose, uuidv7());
      for (const [name, value] of Object.entries(uploaded)) {
        addHidden(form, name, String(value));
      }
      if (input) input.value = "";
      readyToRegister = true;
      form.requestSubmit();
    } catch (error) {
      clientError = error instanceof Error ? error.message : "파일을 업로드하지 못했습니다.";
    } finally {
      uploading = false;
    }
  }
</script>

<form method="POST" {action} enctype="multipart/form-data" class="upload-form" onsubmit={submit}>
  <input type="hidden" name="id" value={recordId} />
  <label>
    <span class="paper-label">{label}</span>
    <input bind:this={input} type="file" name={inputName} {accept} aria-invalid={!!issue || !!clientError} />
    {#if clientError}<small role="alert">{clientError}</small>{:else if issue}<small>{issue}</small>{/if}
  </label>
  <button class="paper-btn" type="submit" disabled={uploading}>{uploading ? "업로드 중…" : buttonLabel}</button>
</form>

<style>
  .upload-form { display: flex; align-items: end; justify-content: space-between; gap: 0.7rem; }
  label { flex: 1; }
  input { width: 100%; }
  small { display: block; margin-top: 0.2rem; color: var(--color-danger-text); font-size: 0.64rem; }
  @media (max-width: 520px) { .upload-form { align-items: stretch; flex-direction: column; }.upload-form button { width: 100%; } }
</style>
