<script lang="ts">
	let { status = '', type = 'badge' } = $props();

	const statusMap: Record<string, { label: string; class: string }> = {
		active: { label: 'Active', class: 'active' },
		approved: { label: 'Approved', class: 'active' },
		pending: { label: 'Pending', class: 'pending' },
		expired: { label: 'Expired', class: 'expired' },
		rejected: { label: 'Rejected', class: 'expired' },
		draft: { label: 'Draft', class: 'pending' },
        attended: { label: 'Attended', class: 'active' },
        absent: { label: 'Absent', class: 'expired' },
        // Types
        '세미나': { label: 'Seminar', class: 'tag' },
        '스터디': { label: 'Study', class: 'tag' },
        '회의': { label: 'Meeting', class: 'tag' },
        '회식': { label: 'Social', class: 'tag' },
        'Seminar': { label: 'Seminar', class: 'tag' }
	};

	const current = $derived(statusMap[status] || { label: status, class: 'pending' });
</script>

{#if type === 'tag'}
	<span class="tag">{current.label}</span>
{:else}
	<span class="status-badge {current.class}">{current.label}</span>
{/if}

<style>
	.status-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 4.2rem;
		padding: 0.2rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-weight: 700;
		border: 1px solid var(--latex-rule);
		border-left-width: 3px;
		line-height: 1.1;
	}

	.status-badge.active {
		background: var(--latex-text);
		color: var(--latex-bg);
	}

	.status-badge.pending {
		color: var(--latex-muted);
		border-style: dashed;
	}

	.status-badge.expired {
		color: var(--latex-accent);
		border-color: var(--latex-accent);
	}

	.tag {
		display: inline-flex;
		padding: 0.18rem 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--latex-rule);
		color: var(--latex-muted);
	}
</style>
