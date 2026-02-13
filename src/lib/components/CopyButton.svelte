<script lang="ts">
    import { toasts } from '$lib/toasts';

    let { text, title = "복사하기" }: { text: string, title?: string } = $props();

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(text);
            toasts.success('클립보드에 복사되었습니다.');
        } catch (err) {
            console.error('Failed to copy: ', err);
            toasts.error('복사에 실패했습니다.');
        }
    }
</script>

<button type="button" class="copy-btn-component" onclick={copyToClipboard} {title}>
    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
        <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/>
    </svg>
</button>

<style>
    .copy-btn-component {
        background: none;
        border: none;
        padding: 0.25rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s, color 0.2s;
        color: var(--text-secondary);
        vertical-align: middle;
    }

    .copy-btn-component:hover {
        background-color: var(--border-color);
        color: var(--text-primary);
    }

    .copy-btn-component :global(svg) {
        display: block;
    }
</style>
