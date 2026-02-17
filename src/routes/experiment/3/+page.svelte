<script lang="ts">
    import Replica from "../../../lib/components/ExperimentReplica.svelte";
</script>

<div class="exp-wrapper">
    <Replica />
</div>

<style>
    .exp-wrapper {
        /* Palette 3 — Minimal Proof (Light) */
        --color-primary: #000000;
        --color-secondary: #4A5568;
        --color-accent: #2D3748;
        --color-bg: #FFFFFF;
        --color-surface: #F7FAFC;
        --color-text-primary: #1A202C;
        --color-text-secondary: #4A5568;
        --color-text-muted: #A0AEC0;
        --color-border: #E2E8F0;
        --color-success: #2D3748;
        --color-success-bg: #EDF2F7;
        --color-error: #000000;
        --color-error-bg: #F7FAFC;
    }

    :global(.dark) .exp-wrapper {
        /* Palette 3 — Minimal Proof (Dark) */
        --color-primary: #FFFFFF;
        --color-secondary: #A0AEC0;
        --color-bg: #000000;
        --color-surface: #171923;
        --color-text-primary: #F7FAFC;
        --color-text-secondary: #A0AEC0;
        --color-border: #2D3748;
        --color-success-bg: #1A202C;
        --color-error-bg: #171923;
    }
</style>
