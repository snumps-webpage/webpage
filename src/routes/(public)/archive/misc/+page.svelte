<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryGrid from "$lib/components/public/PublicDirectoryGrid.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import { ARCHIVE_NAV, type PublicDirectoryEntry } from "$lib/public-navigation";

  const entries: PublicDirectoryEntry[] = [
    { href: "/archive/misc/integration-bee", code: "PUB-14A", title: "Integration Bee", description: "적분 대회 안내와 기록을 보존합니다.", status: "source-pending" },
    { href: "/archive/problems", code: "PUB-14B", title: "문제 창작", description: "회원들이 제작한 문제 PDF 기록을 학기별로 제공합니다.", status: "source-pending" },
    { href: "/archive/discussions", code: "PUB-14C", title: "채팅방 논의", description: "공개 대상으로 확정된 수학 논의 PDF를 제공합니다.", status: "source-pending" },
  ];
</script>

<svelte:head><title>기타 기록 · SNUMPS 아카이브</title><meta name="description" content="SNUMPS Integration Bee, 문제 창작과 채팅방 논의 자료 목록입니다." /></svelte:head>
<article class="paper-document misc-paper"><ManuscriptHeader title="기타 기록" subtitle="Miscellaneous Records" figure={MANUSCRIPT.FIGURES.ARCHIVE_MISC} /><PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" /><p class="scope-note">표준 세미나·스터디 기록에 속하지 않는 학술 활동 자료를 별도로 보존합니다.</p><PublicDirectoryGrid {entries} /></article>
<style>.misc-paper { width: min(100%, 900px); }.scope-note { margin: 0 0 1.2rem; color: var(--latex-muted); font-size: 0.8rem; }</style>
