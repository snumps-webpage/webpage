<nav class="admin-section-nav" aria-label="관리자 레코드 탐색">
  <a href="/admin">운영 대시보드</a>
  <a href="/admin/members">회원·역할</a>
  <a href="/admin/activities">활동 기록</a>
  <a href="/admin/seminars">세미나</a>
  <a href="/admin/studies">스터디</a>
  <a href="/admin/gallery">갤러리</a>
  <a href="/admin/events/new">이벤트 생성</a>
  <a href="/admin/events/connect">활동 연결</a>
</nav>

<style>
  .admin-section-nav { display: flex; flex-wrap: wrap; gap: 0; margin: -0.8rem 0 1.1rem; border: 1px solid var(--latex-rule); }
  a { flex: 1 1 7.5rem; padding: 0.5rem 0.6rem; border-right: 1px solid var(--latex-rule); color: var(--latex-text); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; text-align: center; text-decoration: none; text-transform: uppercase; }
  a:last-child { border-right: 0; }
  a:hover, a:focus-visible { background: var(--latex-text); color: var(--latex-bg); }
  @media (max-width: 600px) { a { flex-basis: 50%; border-bottom: 1px solid var(--latex-rule); } }
</style>
