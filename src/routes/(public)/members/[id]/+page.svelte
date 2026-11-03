<script lang="ts">
  import MemberActivityRecord from "$lib/components/MemberActivityRecord.svelte";
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.member.name} · 회원 명단 · 서울대학교 수학문제연구회</title>
  <meta
    name="description"
    content="{data.member
      .name} 회원의 회원 지위, 활동 기록, 임원 이력과 세미나·스터디 주최, 활동 참석 기록입니다."
  />
</svelte:head>

<MemberActivityRecord {data} />
