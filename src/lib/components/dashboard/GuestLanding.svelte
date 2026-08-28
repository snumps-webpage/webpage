<script lang="ts">
  import { signIn } from "@auth/sveltekit/client";
  import favicon from "$lib/assets/favicon.svg";
  import ExecutiveContacts from "$lib/components/ExecutiveContacts.svelte";
  import SymbolBackground from "$lib/components/SymbolBackground.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import type { PublicExecutiveRoster } from "$lib/domain/members";

  let { executives }: { executives: PublicExecutiveRoster | null } = $props();
</script>

<article class="guest-paper">
  <SymbolBackground date={MANUSCRIPT.FOUNDATION_DATE} />

  <section class="paper-page cover-page">
    <div class="cover-main">
      <div class="cover-rule thick"></div>
      <div class="cover-header-cluster">
        <div class="title-container">
          <img src={favicon} alt="SNUMPS 로고" class="paper-logo" />
          <h1 class="paper-title">
            <span class="text-break">서울대학교</span>
            <span class="text-break">수학문제연구회</span>
          </h1>
          <p class="paper-affiliation">SNUMPS</p>
        </div>
        <ExecutiveContacts roster={executives} variant="cover" />
      </div>
      <div class="cover-rule thin"></div>

      <div class="login-container">
        <button class="google-login-btn" onclick={() => signIn("google")}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span>서울대학교 구글 계정으로 로그인</span>
        </button>
        <p class="login-hint">@snu.ac.kr 계정만 이용 가능합니다.</p>
      </div>

      <div class="scroll-hint-wrapper">
        <p class="scroll-hint">Section I: Abstract</p>
        <div class="scroll-connector"></div>
      </div>
    </div>
    <p class="author-note cover-footnote">* Chair &nbsp;&nbsp; † Vice Chair</p>
  </section>

  <section class="paper-page abstract-page">
    <h2 class="abstract-title" data-glyph="∫">Abstract</h2>
    <p class="abstract-body">
      <span class="drop-cap">S</span>NUMPS는 수학을 좋아하는 사람들이 모여 자유롭게 생각을 나누고,
      함께 배우는 모임입니다. 단순히 문제를 풀고 끝나는 것이 아니라, 직접 문제를 만들어보거나
      풀이 과정을 공유하면서 새로운 시각을 발견하는 활동을 합니다. 이를 통해 수학의 다양한 주제를
      탐구하며 서로 배우고 성장하는 것을 목표로 하는 동아리입니다. 또한 유튜브와 인스타그램에서도
      활동 소식과 기록을 꾸준히 공유하고 있습니다.<sup class="inline-ref">[1, 2]</sup>
    </p>
    <div class="abstract-links">
      <p class="abstract-links-title">Footnotes</p>
      <p class="abstract-link-item">
        <span class="ref-index">[1]</span>
        <a href="https://www.instagram.com/snu_mps" target="_blank" rel="noopener noreferrer">&#92;url(instagram.com/snu_mps)</a>
      </p>
      <p class="abstract-link-item">
        <span class="ref-index">[2]</span>
        <a href="http://www.youtube.com/@snu_mps" target="_blank" rel="noopener noreferrer">&#92;url(youtube.com/@snu_mps)</a>
      </p>
    </div>
  </section>
</article>
