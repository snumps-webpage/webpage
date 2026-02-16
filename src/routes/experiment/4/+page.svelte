<script lang="ts">
    import Replica from "$lib/components/ExperimentReplica.svelte";
</script>

<div class="exp-wrapper">
    <Replica />
</div>

<style>
    .exp-wrapper {
        /* Palette 4 — Scientific Journal (Light) */
        --color-primary: #2D3748;
        --color-secondary: #4A5568;
        --color-accent: #38A169;
        --color-bg: #EDF2F7;
        --color-surface: #E2E8F0;
        --color-text-primary: #2D3748;
        --color-text-secondary: #4A5568;
        --color-text-muted: #718096;
        --color-border: #CBD5E0;
        --color-success: #38A169;
        --color-success-bg: #F0FFF4;
        --color-error: #E53E3E;
        --color-error-bg: #FFF5F5;
    }

    :global(.dark) .exp-wrapper {
        /* Palette 4 — Scientific Journal (Dark) */
        --color-bg: #1A202C;
        --color-surface: #2D3748;
        --color-primary: #68D391;
        --color-text-primary: #E2E8F0;
        --color-text-secondary: #A0AEC0;
        --color-border: #4A5568;
        --color-success-bg: #22543D;
        --color-error-bg: #742A2A;
    }
</style>
