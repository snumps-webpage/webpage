<script lang="ts">
    /**
     * 세미나 포스터 직접 업로드 필드 — 신청 폼과 관리자 기록 편집기가 공유한다.
     * 파일을 스테이징에 올리고, 폼과 함께 전송될 posterPendingKey 히든 인풋을
     * 채운다. 실제 승격·검증(크기/타입/매직바이트)은 서버가 담당한다.
     */
    import { uploadAdminFile } from '$lib/client/api';

    let { label = '포스터 파일 (PNG · JPEG, 최대 15MB)' } = $props();

    let uploading = $state(false);
    let uploadError = $state('');
    let uploadedName = $state('');
    let posterPendingKey = $state('');

    async function handleFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        uploadError = '';
        if (!['image/png', 'image/jpeg'].includes(file.type)) {
            uploadError = 'PNG 또는 JPEG 파일만 올릴 수 있습니다.';
            input.value = '';
            return;
        }
        if (file.size > 15_000_000) {
            uploadError = '포스터 파일은 15MB 이하여야 합니다.';
            input.value = '';
            return;
        }
        uploading = true;
        try {
            const result = await uploadAdminFile(file, 'seminar-poster', crypto.randomUUID());
            posterPendingKey = result.s3Key;
            uploadedName = file.name;
        } catch {
            uploadError = '포스터 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.';
            posterPendingKey = '';
            uploadedName = '';
        } finally {
            uploading = false;
        }
    }
</script>

<div class="poster-upload">
    <input type="hidden" name="posterPendingKey" value={posterPendingKey} />
    <label for="poster-file" class="paper-label">{label}</label>
    <input id="poster-file" type="file" accept="image/png,image/jpeg" onchange={handleFile} disabled={uploading} />
    {#if uploading}<p class="paper-hint">업로드 중…</p>{/if}
    {#if uploadedName}<p class="paper-hint">✓ 업로드됨: {uploadedName}</p>{/if}
    {#if uploadError}<p class="upload-error">{uploadError}</p>{/if}
</div>

<style>
    .poster-upload { display: grid; gap: 0.5rem; }
    .poster-upload input[type="file"] { font-size: 0.8rem; }
    .upload-error { margin: 0; color: var(--color-danger-text, #b00); font-size: 0.78rem; }
</style>
