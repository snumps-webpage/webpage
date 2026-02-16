<script lang="ts">
    const experiments = [
        { id: 1, name: "Academic Legacy", desc: "Conservative & Institutional", colors: ["#1A365D", "#3E2723", "#9B2C2C", "#FDFBF7"] },
        { id: 2, name: "Modern Theorem", desc: "Modern & Tech-forward", colors: ["#3182CE", "#2D3748", "#00B5D8", "#0F172A"] },
        { id: 3, name: "Minimal Proof", desc: "Minimal & Monochromatic", colors: ["#000000", "#4A5568", "#2D3748", "#FFFFFF"] },
        { id: 4, name: "Scientific Journal", desc: "Soft & Human-centered", colors: ["#2D3748", "#4A5568", "#38A169", "#EDF2F7"] }
    ];
</script>

<div class="exp-container">
    <header class="exp-header">
        <h1>Palette Experimentation</h1>
        <p>Strategic visual identity exploration for SNUMPS Automation.</p>
    </header>

    <div class="exp-grid">
        {#each experiments as exp}
            <a href="/experiment/{exp.id}" class="exp-card">
                <div class="swatch-grid">
                    {#each exp.colors as color}
                        <div class="swatch" style="background: {color}"></div>
                    {/each}
                </div>
                <div class="exp-info">
                    <h2>{exp.name}</h2>
                    <p>{exp.desc}</p>
                    <span class="exp-link">View Experiment →</span>
                </div>
            </a>
        {/each}
    </div>
</div>

<style>
    .exp-container {
        max-width: 1000px;
        margin: 4rem auto;
        padding: 0 2rem;
    }

    .exp-header {
        text-align: center;
        margin-bottom: 4rem;
    }

    .exp-header h1 {
        font-family: var(--font-display);
        font-size: 3rem;
        font-style: italic;
        margin-bottom: 1rem;
    }

    .exp-header p {
        font-family: var(--font-mono);
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .exp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 2rem;
    }

    .exp-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
        text-decoration: none;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
    }

    .exp-card:hover {
        transform: translateY(-8px);
        box-shadow: var(--shadow);
        border-color: var(--color-primary);
    }

    .swatch-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        height: 120px;
    }

    .swatch {
        height: 100%;
    }

    .exp-info {
        padding: 2rem;
    }

    .exp-info h2 {
        font-family: var(--font-display);
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
        color: var(--color-text-primary);
    }

    .exp-info p {
        font-family: var(--font-body);
        color: var(--color-text-secondary);
        margin-bottom: 1.5rem;
    }

    .exp-link {
        font-family: var(--font-mono);
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--color-primary);
    }
</style>
