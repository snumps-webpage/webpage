<script lang="ts">
    import Replica from "../../../lib/components/ExperimentReplica.svelte";
</script>

<div class="exp-wrapper">
    <Replica />
</div>

<style>
    .exp-wrapper {
        /* Palette 2 — Modern Theorem (Light) */
        --color-primary: #3182CE;
        --color-secondary: #4A5568;
        --color-accent: #00B5D8;
        --color-bg: #F7FAFC;
        --color-surface: #EDF2F7;
        --color-text-primary: #1A202C;
        --color-text-secondary: #4A5568;
        --color-text-muted: #718096;
        --color-border: #CBD5E0;
        --color-success: #38A169;
        --color-success-bg: #F0FFF4;
        --color-error: #E53E3E;
        --color-error-bg: #FFF5F5;
        --color-success-text: var(--color-success);
        --color-danger-text: var(--color-error);
        --color-danger-bg: var(--color-error-bg);
        --color-warning-text: var(--color-secondary);
    }

    :global(.dark) .exp-wrapper {
        /* Palette 2 — Modern Theorem (Dark) */
        --color-primary: #3182CE;
        --color-secondary: #2D3748;
        --color-accent: #00B5D8;
        --color-bg: #0F172A;
        --color-surface: #1E293B;
        --color-text-primary: #F8FAFC;
        --color-text-secondary: #94A3B8;
        --color-text-muted: #64748B;
        --color-border: #334155;
        --color-success: #48BB78;
        --color-success-bg: rgba(72, 187, 120, 0.1);
        --color-error: #F56565;
        --color-error-bg: rgba(245, 101, 101, 0.1);
        --color-success-text: var(--color-success);
        --color-danger-text: var(--color-error);
        --color-danger-bg: var(--color-error-bg);
        --color-warning-text: var(--color-secondary);
    }
</style>
