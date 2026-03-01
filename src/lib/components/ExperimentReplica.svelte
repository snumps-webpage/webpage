<script lang="ts">
    const mockSeminars = [
        { id: 1, title: "Complex Analysis Intro", semester: "26-1", remarks: "정칙함수와 적분정리" },
        { id: 2, title: "Algebraic Topology Reading", semester: "26-1", remarks: "Hatcher Chapter 1" }
    ];

    const mockRequests = [
        { id: 1, title: "Elliptic Curves Study", status: "pending", submittedAt: "2026-02-10" },
        { id: 2, title: "PDE Seminar", status: "approved", submittedAt: "2026-02-03" }
    ];

    const mockActivities = [
        { id: 1, date: "2026-02-15", name: "Advanced Topology Seminar", type: "세미나", attended: true },
        { id: 2, date: "2026-02-10", name: "Problem Solving Workshop", type: "스터디", attended: false },
        { id: 3, date: "2026-02-05", name: "Winter General Meeting", type: "회의", attended: true },
        { id: 4, date: "2026-01-29", name: "Reading Session: Measure Theory", type: "스터디", attended: true }
    ];

    const attendedCount = mockActivities.filter((activity) => activity.attended).length;
    const totalCount = mockActivities.length;
    const attendancePercent = totalCount > 0 ? Math.round((attendedCount / totalCount) * 100) : 0;
</script>

<div class="replica-root manuscript">
    <nav class="replica-nav">
        <div class="replica-nav-inner">
            <span class="logo">SNUMPS</span>
            <div class="nav-links">
                <span>Seminar</span>
                <span class="btn-pill">Admin</span>
                <span class="btn-pill">DB</span>
                <span class="logout">Logout</span>
            </div>
        </div>
    </nav>

    <main class="replica-main">
        <header class="dashboard-header">
            <div>
                <p class="section-marker">Issue 2026-Spring</p>
                <h1>활동 현황</h1>
            </div>
            <button class="refresh-btn">새로고침</button>
        </header>

        <div class="dashboard-grid">
            <figure class="figure-block">
                <figcaption class="figure-caption">
                    <span class="figure-label">Figure 1</span>
                    <span class="figure-glyph" aria-hidden="true">∫</span>
                    <span class="figure-title">세미나 관리</span>
                </figcaption>
                <div class="block-head">
                    <h2>세미나 관리</h2>
                    <span class="chevron">▼</span>
                </div>
                <div class="block-body">
                    <button class="btn-primary">새 세미나 신청</button>
                    <div class="seminar-list">
                        {#each mockSeminars as seminar (seminar.id)}
                            <article class="seminar-item approved">
                                <span class="tag">기록됨</span>
                                <p class="item-title">{seminar.title}</p>
                                <p class="item-meta">{seminar.semester} | {seminar.remarks}</p>
                            </article>
                        {/each}
                        {#each mockRequests as request (request.id)}
                            <article class="seminar-item request {request.status}">
                                <span class="tag">{request.status === "pending" ? "승인 대기" : "승인됨"}</span>
                                <p class="item-title">{request.title}</p>
                                <p class="item-meta">{request.submittedAt} 신청</p>
                            </article>
                        {/each}
                    </div>
                </div>
            </figure>

            <figure class="figure-block">
                <figcaption class="figure-caption">
                    <span class="figure-label">Figure 2</span>
                    <span class="figure-glyph" aria-hidden="true">∂</span>
                    <span class="figure-title">회원 정보 관리</span>
                </figcaption>
                <div class="block-head">
                    <h2>회원 정보 관리</h2>
                    <span class="chevron">▼</span>
                </div>
                <div class="block-body">
                    <form class="profile-form">
                        <label class="form-group">
                            <span>전화번호</span>
                            <input type="tel" value="010-1234-5678" />
                        </label>
                        <label class="form-group">
                            <span>배경지식</span>
                            <textarea rows="3">대수기하, 해석학, 조합론</textarea>
                        </label>
                        <button class="btn-primary">저장</button>
                    </form>
                </div>
            </figure>

            <figure class="figure-block stats-block">
                <figcaption class="figure-caption">
                    <span class="figure-label">Figure 3</span>
                    <span class="figure-glyph" aria-hidden="true">Σ</span>
                    <span class="figure-title">출석 통계</span>
                </figcaption>
                <h2>26-1 출석 현황</h2>
                <div class="stats-grid">
                    <div class="stats-text">
                        <div class="stat-item">
                            <span class="value">{attendedCount}</span>
                            <span class="label">출석</span>
                        </div>
                        <span class="divider">/</span>
                        <div class="stat-item">
                            <span class="value muted">{totalCount}</span>
                            <span class="label">전체 활동</span>
                        </div>
                    </div>
                    <div class="meter-figure">
                        <div class="meter-track" aria-hidden="true">
                            <div class="meter-fill" style={`width: ${attendancePercent}%`}></div>
                        </div>
                        <p class="meter-meta">
                            <span>출석률</span>
                            <strong>{attendancePercent}%</strong>
                        </p>
                    </div>
                </div>
            </figure>
        </div>

        <figure class="figure-block list-block">
            <figcaption class="figure-caption">
                <span class="figure-label">Figure 4</span>
                <span class="figure-glyph" aria-hidden="true">∀</span>
                <span class="figure-title">활동 목록</span>
            </figcaption>
            <div class="list-header">
                <h3>활동 목록</h3>
                <div class="filters">
                    <span class="select-chip">전체 종류</span>
                    <span class="select-chip">전체 상태</span>
                    <span class="select-chip">26-1학기</span>
                </div>
            </div>

            <div class="alert success">
                신청이 완료되었습니다. 관리자 승인 후 본 시스템에 자동 반영됩니다.
            </div>

            <div class="table-wrap desktop-only">
                <table class="replica-table">
                    <thead>
                        <tr>
                            <th>날짜</th>
                            <th>활동명</th>
                            <th>종류</th>
                            <th>출석</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each mockActivities as activity (activity.id)}
                            <tr>
                                <td class="date">{activity.date}</td>
                                <td class="activity-name">{activity.name}</td>
                                <td><span class="tag-outline">{activity.type}</span></td>
                                <td>
                                    <span class="badge {activity.attended ? 'success' : 'fail'}">
                                        {activity.attended ? "출석" : "결석"}
                                    </span>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <div class="mobile-list mobile-only">
                {#each mockActivities as activity (activity.id)}
                    <figure class="activity-card">
                        <figcaption class="activity-caption">
                            <span aria-hidden="true">{activity.attended ? "✓" : "∅"}</span>
                            <span>{activity.type}</span>
                        </figcaption>
                        <div class="activity-head">
                            <span class="date">{activity.date}</span>
                            <span class="badge {activity.attended ? 'success' : 'fail'}">
                                {activity.attended ? "출석" : "결석"}
                            </span>
                        </div>
                        <p class="activity-name">{activity.name}</p>
                    </figure>
                {/each}
            </div>
        </figure>

        <footer class="replica-footer">
            <p>회장: 공석 | snumps0@gmail.com | snu_mps</p>
        </footer>
    </main>
</div>

<style>
    .replica-root {
        --paper-border: var(--color-border);
        --paper-bg: var(--color-bg);
        --paper-surface: var(--color-surface);
        --paper-text: var(--color-text-primary);
        --paper-muted: var(--color-text-secondary);

        min-height: 100vh;
        background: var(--paper-bg);
        color: var(--paper-text);
        font-family: var(--font-body);
        position: relative;
    }

    .replica-root.manuscript::before,
    .replica-root.manuscript::after {
        position: absolute;
        top: 5.3rem;
        font-family: var(--font-math, var(--font-display));
        font-size: 1.2rem;
        color: rgba(95, 100, 109, 0.55);
        pointer-events: none;
    }

    .replica-root.manuscript::before {
        content: "∫";
        left: 1rem;
    }

    .replica-root.manuscript::after {
        content: "∑";
        right: 1rem;
    }

    .replica-nav {
        height: 4rem;
        border-bottom: 1px solid var(--paper-border);
        background: var(--paper-surface);
        display: flex;
        align-items: center;
        padding: 0 1.2rem;
    }

    .replica-nav-inner {
        max-width: 1180px;
        margin: 0 auto;
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }

    .logo {
        font-family: var(--font-display);
        font-style: italic;
        font-size: 1.2rem;
        font-weight: 600;
    }

    .nav-links {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        font-family: var(--font-mono);
        font-size: 0.67rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
    }

    .btn-pill {
        border: 1px solid var(--paper-border);
        padding: 0.27rem 0.55rem;
    }

    .logout {
        opacity: 0.65;
    }

    .replica-main {
        max-width: 980px;
        margin: 0 auto;
        padding: 2rem 1rem 3rem;
    }

    .dashboard-header {
        border-bottom: 1px solid var(--paper-border);
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 1rem;
        padding-bottom: 0.85rem;
        margin-bottom: 1.35rem;
        position: relative;
    }

    .dashboard-header::after {
        content: "";
        position: absolute;
        left: 0;
        bottom: -1px;
        width: 6rem;
        border-bottom: 2px solid var(--paper-text);
    }

    .section-marker {
        margin: 0 0 0.18rem;
        color: var(--paper-muted);
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        font-family: var(--font-mono);
    }

    h1 {
        margin: 0;
        font-size: clamp(1.95rem, 3.3vw, 2.45rem);
        font-style: italic;
        font-weight: 560;
    }

    .refresh-btn {
        border: 1px solid var(--paper-border);
        background: transparent;
        color: var(--paper-text);
        padding: 0.45rem 0.78rem;
        font-family: var(--font-mono);
        font-size: 0.69rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .dashboard-grid {
        display: grid;
        gap: 1.1rem;
    }

    .figure-block {
        margin: 0;
        border: 1px solid var(--paper-border);
        border-left: 3px solid var(--paper-text);
        background: var(--paper-surface);
        overflow: hidden;
    }

    .figure-caption {
        padding: 0.45rem 0.86rem;
        border-bottom: 1px solid var(--paper-border);
        display: flex;
        align-items: center;
        gap: 0.4rem;
        background: rgba(31, 39, 48, 0.05);
    }

    .figure-label {
        font-size: 0.62rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--paper-muted);
        font-family: var(--font-mono);
        font-weight: 600;
    }

    .figure-glyph {
        font-family: var(--font-math, var(--font-display));
        font-size: 0.96rem;
    }

    .figure-title {
        color: var(--paper-muted);
        font-size: 0.82rem;
        font-style: italic;
    }

    .block-head {
        padding: 0.9rem 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--paper-border);
    }

    .block-head h2 {
        margin: 0;
        font-size: 1.1rem;
        font-style: italic;
    }

    .chevron {
        font-size: 0.72rem;
        color: var(--paper-muted);
        font-family: var(--font-mono);
    }

    .block-body {
        padding: 1rem;
    }

    .btn-primary {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        border: 1px solid var(--paper-text);
        background: var(--paper-text);
        color: var(--paper-bg);
        padding: 0.62rem 0.8rem;
        font-size: 0.7rem;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 600;
        margin-bottom: 0.75rem;
    }

    .seminar-list {
        display: grid;
        gap: 0.72rem;
    }

    .seminar-item {
        border: 1px solid var(--paper-border);
        border-left: 3px solid var(--paper-muted);
        padding: 0.76rem;
        background: var(--paper-bg);
    }

    .seminar-item.approved {
        border-left-color: var(--paper-text);
    }

    .seminar-item.request.pending {
        border-left-color: var(--color-warning-text);
    }

    .seminar-item.request.approved {
        border-left-color: var(--color-success-text);
    }

    .tag {
        display: inline-block;
        border: 1px solid var(--paper-border);
        font-size: 0.6rem;
        padding: 0.16rem 0.34rem;
        font-family: var(--font-mono);
        letter-spacing: 0.09em;
        text-transform: uppercase;
        margin-bottom: 0.45rem;
        color: var(--paper-muted);
    }

    .item-title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 1.02rem;
        font-style: italic;
        font-weight: 560;
    }

    .item-meta {
        margin: 0.2rem 0 0;
        font-size: 0.86rem;
        color: var(--paper-muted);
        font-style: italic;
    }

    .profile-form {
        display: grid;
        gap: 0.72rem;
    }

    .form-group {
        display: grid;
        gap: 0.36rem;
    }

    .form-group span {
        font-size: 0.64rem;
        color: var(--paper-muted);
        font-family: var(--font-mono);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-weight: 600;
    }

    input,
    textarea {
        border: 1px solid var(--paper-border);
        background: var(--paper-bg);
        color: var(--paper-text);
        padding: 0.62rem 0.72rem;
        font-family: var(--font-body);
        font-size: 0.92rem;
        resize: none;
    }

    .stats-block h2 {
        margin: 0;
        padding: 1rem 1rem 0;
        font-size: 1.15rem;
        font-style: italic;
    }

    .stats-grid {
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }

    .stats-text {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .value {
        font-family: var(--font-display);
        font-size: 2.5rem;
        line-height: 1;
    }

    .value.muted {
        opacity: 0.46;
    }

    .label {
        margin-top: 0.42rem;
        font-family: var(--font-mono);
        font-size: 0.62rem;
        letter-spacing: 0.11em;
        text-transform: uppercase;
        color: var(--paper-muted);
    }

    .divider {
        font-size: 2rem;
        color: var(--paper-border);
        font-family: var(--font-math, var(--font-display));
    }

    .meter-figure {
        min-width: 160px;
    }

    .meter-track {
        height: 0.9rem;
        border: 1px solid var(--paper-border);
        background: var(--paper-bg);
    }

    .meter-fill {
        height: 100%;
        background: var(--paper-text);
    }

    .meter-meta {
        margin: 0.36rem 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.64rem;
        font-family: var(--font-mono);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--paper-muted);
    }

    .meter-meta strong {
        color: var(--paper-text);
        font-size: 0.75rem;
        font-weight: 650;
    }

    .list-block {
        margin-top: 1.25rem;
    }

    .list-header {
        padding: 0.95rem 1rem;
        border-bottom: 1px solid var(--paper-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.8rem;
    }

    h3 {
        margin: 0;
        font-size: 1.3rem;
        font-style: italic;
    }

    .filters {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.45rem;
    }

    .select-chip {
        border: 1px solid var(--paper-border);
        padding: 0.34rem 0.52rem;
        font-size: 0.62rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: var(--font-mono);
    }

    .alert {
        margin: 0.95rem 1rem 0.8rem;
        border: 1px solid var(--color-success-text);
        background: var(--color-success-bg);
        color: var(--color-success-text);
        padding: 0.72rem;
        font-size: 0.82rem;
        text-align: center;
    }

    .table-wrap {
        margin: 0 1rem 1rem;
        border: 1px solid var(--paper-border);
        background: var(--paper-bg);
        overflow: hidden;
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }

    th {
        padding: 0.72rem 0.85rem;
        text-align: left;
        font-size: 0.64rem;
        border-bottom: 1px solid var(--paper-border);
        font-family: var(--font-mono);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--paper-muted);
    }

    td {
        padding: 0.82rem 0.85rem;
        border-bottom: 1px solid var(--paper-border);
        font-size: 0.93rem;
    }

    tr:last-child td {
        border-bottom: none;
    }

    .date {
        font-family: var(--font-mono);
        font-size: 0.75rem;
        color: var(--paper-muted);
    }

    .activity-name {
        margin: 0;
        font-family: var(--font-display);
        font-style: italic;
        font-weight: 560;
    }

    .tag-outline {
        border: 1px solid var(--paper-border);
        padding: 0.18rem 0.38rem;
        font-family: var(--font-mono);
        font-size: 0.62rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--paper-muted);
    }

    .badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        font-size: 0.62rem;
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.07em;
        font-weight: 600;
    }

    .badge.success {
        background: var(--color-success-bg);
        color: var(--color-success-text);
    }

    .badge.fail {
        background: var(--color-danger-bg);
        color: var(--color-danger-text);
    }

    .mobile-list {
        display: none;
        padding: 0 0.8rem 0.8rem;
        gap: 0.65rem;
    }

    .activity-card {
        margin: 0;
        border: 1px solid var(--paper-border);
        background: var(--paper-bg);
        overflow: hidden;
    }

    .activity-caption {
        padding: 0.36rem 0.62rem;
        border-bottom: 1px solid var(--paper-border);
        display: flex;
        gap: 0.25rem;
        align-items: center;
        color: var(--paper-muted);
        text-transform: uppercase;
        font-size: 0.62rem;
        letter-spacing: 0.08em;
        font-family: var(--font-mono);
    }

    .activity-head {
        padding: 0.62rem 0.65rem 0.42rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .activity-card .activity-name {
        padding: 0 0.65rem 0.72rem;
        font-size: 0.98rem;
    }

    .replica-footer {
        margin-top: 1.4rem;
        border-top: 1px solid var(--paper-border);
        padding-top: 1rem;
        text-align: center;
        color: var(--paper-muted);
        font-size: 0.78rem;
    }

    .desktop-only {
        display: block;
    }

    .mobile-only {
        display: none;
    }

    @media (max-width: 860px) {
        .replica-root.manuscript::before,
        .replica-root.manuscript::after {
            display: none;
        }

        .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .list-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .filters {
            justify-content: flex-start;
        }
    }

    @media (max-width: 720px) {
        .desktop-only {
            display: none;
        }

        .mobile-only {
            display: grid;
        }

        .replica-main {
            padding: 1.1rem 0.75rem 2.3rem;
        }

        .nav-links {
            font-size: 0.6rem;
            gap: 0.48rem;
        }

        .btn-pill {
            padding: 0.22rem 0.35rem;
        }

        .stats-grid {
            flex-direction: column;
            align-items: center;
        }
    }
</style>
