<script lang="ts">
    import Replica from "$lib/components/ExperimentReplica.svelte";
</script>

<div class="exp-wrapper">
    <Replica />
</div>

<style>
    .exp-wrapper {
        /* Palette 1 — Academic Legacy (Light) */
        --color-primary: #1A365D;
        --color-secondary: #3E2723;
        --color-accent: #9B2C2C;
        --color-bg: #FDFBF7;
        --color-surface: #F4F1EA;
        --color-text-primary: #1A202C;
        --color-text-secondary: #4A5568;
        --color-text-muted: #718096;
        --color-border: #D1D5DB;
        --color-success: #2F855A;
        --color-success-bg: #E8F5E9;
        --color-error: #b71c1c;
        --color-error-bg: #FFF5F5;
        --color-success-text: var(--color-success);
        --color-danger-text: var(--color-error);
        --color-danger-bg: var(--color-error-bg);
        --color-warning-text: var(--color-secondary);
    }

    :global(.dark) .exp-wrapper {
        /* Palette 1 — Academic Legacy (Dark) */
        --color-bg: #0F172A;
        --color-surface: #1E293B;
        --color-primary: #93C5FD;
        --color-text-primary: #F8FAFC;
        --color-text-secondary: #94A3B8;
        --color-border: #334155;
        --color-success-bg: #064E3B;
        --color-error-bg: #7F1D1D;
        --color-success-text: var(--color-success);
        --color-danger-text: var(--color-error);
        --color-danger-bg: var(--color-error-bg);
        --color-warning-text: var(--color-secondary);
    }
</style>
