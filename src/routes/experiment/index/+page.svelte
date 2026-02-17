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
            <figure class="exp-figure">
                <figcaption class="figure-caption no-sel">
                    <span class="figure-label">Figure X{exp.id}</span>
                    <span class="figure-title">{exp.name}</span>
                </figcaption>
                <a href="/experiment/{exp.id}" class="exp-link-block">
                    <div class="swatch-grid" aria-hidden="true">
                        {#each exp.colors as color}
                            <div class="swatch" style="background: {color}"></div>
                        {/each}
                    </div>
                    <div class="exp-info">
                        <h2>{exp.name}</h2>
                        <p>{exp.desc}</p>
                        <span class="exp-link">Open Study</span>
                    </div>
                </a>
            </figure>
        {/each}
    </div>
</div>

<style>
    .exp-container {
        width: min(100%, 68rem);
        margin: 1.5rem auto;
        padding: 0 1rem 1.2rem;
    }

    .exp-header {
        margin-bottom: 1rem;
        border-top: 2px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
        padding: 0.72rem 0;
        text-align: center;
    }

    .exp-header h1 {
        font-family: var(--font-display);
        font-size: clamp(1.52rem, 3.2vw, 2.08rem);
        font-style: italic;
        margin: 0;
        font-weight: 560;
    }

    .exp-header p {
        margin: 0.34rem 0 0;
        font-family: var(--font-mono);
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.67rem;
    }

    .exp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 0.62rem;
    }

    .exp-figure {
        margin: 0;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        border-left: 2px solid var(--text-secondary);
    }

    .figure-caption {
        display: flex;
        gap: 0.45rem;
        align-items: center;
        padding: 0.45rem 0.62rem;
        border-bottom: 1px solid var(--border-color);
    }

    .figure-label {
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.62rem;
        color: var(--text-secondary);
    }

    .figure-title {
        font-size: 0.8rem;
        color: var(--text-secondary);
        font-style: italic;
    }

    .exp-link-block {
        display: block;
        color: inherit;
        text-decoration: none;
        transition: background-color 0.16s, border-color 0.16s;
    }

    .exp-link-block:hover {
        background: color-mix(in srgb, var(--bg-secondary) 86%, var(--text-primary));
    }

    .swatch-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        height: 90px;
        border-bottom: 1px solid var(--border-color);
    }

    .swatch {
        height: 100%;
    }

    .exp-info {
        padding: 0.72rem;
    }

    .exp-info h2 {
        font-family: var(--font-display);
        font-size: 1.06rem;
        margin: 0 0 0.2rem;
        color: var(--text-primary);
        font-style: italic;
        font-weight: 550;
    }

    .exp-info p {
        font-family: var(--font-body);
        color: var(--text-secondary);
        margin: 0 0 0.42rem;
        font-size: 0.88rem;
    }

    .exp-link {
        font-family: var(--font-mono);
        font-size: 0.65rem;
        font-weight: 650;
        text-transform: uppercase;
        color: var(--text-secondary);
        letter-spacing: 0.08em;
    }
</style>
