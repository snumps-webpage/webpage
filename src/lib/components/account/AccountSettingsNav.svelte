<script lang="ts">
  let { current }: { current: "notifications" | "withdraw" } = $props();
</script>

<nav class="settings-nav" aria-label="회원 설정">
  <a href="/settings/notifications" aria-current={current === "notifications" ? "page" : undefined}>
    공지 수신
  </a>
  <a href="/settings/withdraw" aria-current={current === "withdraw" ? "page" : undefined}>
    회원 탈퇴
  </a>
</nav>

<style>
  .settings-nav { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 0.85rem; border: 1px solid var(--latex-rule); }
  a { flex: 1 1 10rem; padding: 0.65rem 0.8rem; color: var(--latex-muted); font: 700 0.67rem/1.2 var(--font-mono); letter-spacing: 0.06em; text-align: center; text-decoration: none; text-transform: uppercase; }
  a + a { border-left: 1px solid var(--latex-rule); }
  a[aria-current="page"] { background: var(--latex-text); color: var(--latex-bg); }
  @media (max-width: 420px) { a { flex-basis: 100%; } a + a { border-left: 0; border-top: 1px solid var(--latex-rule); } }
</style>
