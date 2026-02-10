<script lang="ts">
    import { toasts } from '$lib/toasts';
    import { flip } from 'svelte/animate';
    import { fly } from 'svelte/transition';
</script>

<div class="toast-container no-sel">
    {#each $toasts as toast (toast.id)}
        <div 
            class="toast {toast.type}" 
            animate:flip={{ duration: 300 }}
            in:fly={{ y: 20, opacity: 0 }}
            out:fly={{ x: 20, opacity: 0 }}
        >
            <span class="message">{toast.message}</span>
            <button class="close" onclick={() => toasts.remove(toast.id)}>✕</button>
        </div>
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        z-index: 10000;
        pointer-events: none;
    }

    .toast {
        pointer-events: auto;
        padding: 1rem 1.25rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: var(--shadow);
        display: flex;
        align-items: center;
        gap: 1rem;
        min-width: 250px;
        max-width: 400px;
    }

    .message {
        flex: 1;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        font-family: "Inter", "Noto Sans KR", sans-serif;
    }

    .close {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 1.1rem;
        padding: 0.2rem;
        line-height: 1;
    }

    .close:hover { color: var(--text-primary); }

    .toast.success { border-left: 4px solid var(--color-success-text); }
    .toast.error { border-left: 4px solid var(--color-danger-text); }
    .toast.info { border-left: 4px solid var(--text-secondary); }
</style>
