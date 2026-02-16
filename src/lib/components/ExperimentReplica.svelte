<script lang="ts">
    // Mock data for the replica
    const mockActivities = [
        { id: 1, date: "2026-02-15", name: "Advanced Topology Seminar", type: "세미나", attended: true },
        { id: 2, date: "2026-02-10", name: "Problem Solving Workshop", type: "스터디", attended: false },
        { id: 3, date: "2026-02-05", name: "Winter General Meeting", type: "회의", attended: true }
    ];
</script>

<div class="replica-root">
    <nav class="replica-nav">
        <div class="replica-content">
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
        <header class="hero">
            <h1>활동 현황</h1>
            <button class="btn-secondary">새로고침</button>
        </header>

        <div class="grid">
            <section class="card">
                <div class="card-header">
                    <h2>세미나 관리</h2>
                    <span>▼</span>
                </div>
                <div class="card-body">
                    <button class="btn-primary">새 세미나 신청</button>
                    <div class="item">
                        <span class="tag">기록됨</span>
                        <p class="item-title">Complex Analysis Intro</p>
                        <p class="item-meta">25-2 | No Remarks</p>
                    </div>
                </div>
            </section>

            <section class="card">
                <div class="card-header">
                    <h2>25-2 출석 현황</h2>
                </div>
                <div class="stats">
                    <div class="stat-item">
                        <span class="val">12</span>
                        <span class="lab">출석</span>
                    </div>
                    <div class="divider">/</div>
                    <div class="stat-item">
                        <span class="val muted">15</span>
                        <span class="lab">전체 활동</span>
                    </div>
                    <div class="chart"></div>
                </div>
            </section>
        </div>

        <section class="list-section">
            <div class="list-header">
                <h3>활동 목록</h3>
                <div class="filters">
                    <div class="select">전체 종류</div>
                    <div class="select">전체 상태</div>
                    <div class="select">25-2학기</div>
                </div>
            </div>

            <div class="alert success">
                신청이 완료되었습니다! 관리자 승인 후 이용이 가능합니다.
            </div>

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
                    {#each mockActivities as act}
                        <tr class={act.attended ? 'attended' : 'absent'}>
                            <td>{act.date}</td>
                            <td class="name">{act.name}</td>
                            <td><span class="tag-outline">{act.type}</span></td>
                            <td>
                                <span class="badge {act.attended ? 'success' : 'fail'}">
                                    {act.attended ? '출석' : '결석'}
                                </span>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </section>

        <footer class="replica-footer">
            <p>회장: 홍길동 | snumps0@gmail.com</p>
        </footer>
    </main>
</div>

<style>
    .replica-root {
        background: var(--color-bg);
        color: var(--color-text-primary);
        min-height: 100vh;
        font-family: var(--font-body);
    }

    .replica-nav {
        height: 4rem;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
        display: flex;
        align-items: center;
        padding: 0 2rem;
    }

    .replica-content {
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .logo { font-family: var(--font-display); font-weight: 700; font-size: 1.5rem; }
    .nav-links { display: flex; gap: 1.5rem; align-items: center; font-family: var(--font-mono); font-size: 0.8rem; text-transform: uppercase; }
    .btn-pill { border: 1px solid var(--color-border); padding: 0.4rem 1rem; border-radius: 99px; }
    .logout { opacity: 0.6; }

    .replica-main { max-width: 900px; margin: 0 auto; padding: 4rem 2rem; }
    .hero { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem; border-bottom: 2px solid var(--color-border); padding-bottom: 1rem; }
    .hero h1 { font-family: var(--font-display); font-size: 2.5rem; font-style: italic; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 3rem; }
    .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
    .card-header { padding: 1.5rem; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; }
    .card-header h2 { font-family: var(--font-display); font-size: 1.25rem; font-style: italic; }
    .card-body { padding: 1.5rem; }

    .btn-primary { width: 100%; padding: 1rem; background: var(--color-primary); color: var(--color-bg); border: none; border-radius: 8px; font-family: var(--font-mono); text-transform: uppercase; font-weight: 700; margin-bottom: 1.5rem; }
    .btn-secondary { padding: 0.5rem 1.5rem; background: transparent; border: 1px solid var(--color-border); border-radius: 99px; font-family: var(--font-mono); font-size: 0.8rem; }

    .item { background: var(--color-bg); border: 1px solid var(--color-border); padding: 1rem; border-radius: 8px; }
    .tag { font-size: 0.6rem; font-family: var(--font-mono); text-transform: uppercase; opacity: 0.6; }
    .item-title { font-family: var(--font-display); font-weight: 600; font-size: 1.1rem; margin: 0.25rem 0; }
    .item-meta { font-size: 0.8rem; opacity: 0.7; font-style: italic; }

    .stats { display: flex; align-items: center; gap: 1.5rem; padding: 2rem; }
    .val { font-size: 3rem; font-family: var(--font-display); }
    .muted { opacity: 0.3; }
    .lab { font-size: 0.7rem; font-family: var(--font-mono); text-transform: uppercase; }
    .chart { width: 60px; height: 60px; border-radius: 50%; background: conic-gradient(var(--color-primary) 80%, var(--color-border) 0); margin-left: auto; }

    .list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .filters { display: flex; gap: 0.5rem; }
    .select { padding: 0.4rem 1rem; border: 1px solid var(--color-border); border-radius: 99px; font-size: 0.7rem; font-family: var(--font-mono); }

    .alert { padding: 1rem; border-radius: 8px; margin-bottom: 2rem; text-align: center; font-size: 0.9rem; font-weight: 600; }
    .success { background: var(--color-success-bg); color: var(--color-success); border: 1px solid var(--color-success); }

    .replica-table { width: 100%; border-collapse: collapse; background: var(--color-surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--color-border); }
    th { text-align: left; padding: 1rem; background: var(--color-surface); font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; border-bottom: 1px solid var(--color-border); }
    td { padding: 1.25rem 1rem; border-bottom: 1px solid var(--color-border); }
    .name { font-family: var(--font-display); font-style: italic; font-weight: 600; }
    .tag-outline { padding: 0.2rem 0.5rem; border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono); }
    .badge { padding: 0.3rem 0.8rem; border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono); text-transform: uppercase; }
    .badge.success { background: var(--color-success-bg); color: var(--color-success); }
    .badge.fail { background: var(--color-error-bg); color: var(--color-error); }

    .replica-footer { margin-top: 4rem; padding: 2rem; border-top: 1px solid var(--color-border); text-align: center; opacity: 0.6; font-size: 0.8rem; }
</style>
