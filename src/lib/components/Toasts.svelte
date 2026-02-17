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
        bottom: 1.25rem;
        right: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        z-index: 10000;
        pointer-events: none;
    }

    .toast {
        pointer-events: auto;
        padding: 0.72rem 0.8rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-left-width: 2px;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-width: 220px;
        max-width: 380px;
    }

    .message {
        flex: 1;
        font-size: 0.86rem;
        line-height: 1.45;
        font-weight: 500;
        color: var(--text-primary);
        font-family: var(--font-body);
    }

    .close {
        background: none;
        border: 1px solid transparent;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.82rem;
        padding: 0.22rem 0.36rem;
        line-height: 1;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .close:hover {
        border-color: var(--border-color);
        color: var(--text-primary);
    }

    .toast.success { border-left-color: var(--color-success-text); }
    .toast.error { border-left-color: var(--color-danger-text); }
    .toast.info { border-left-color: var(--text-secondary); }
</style>
