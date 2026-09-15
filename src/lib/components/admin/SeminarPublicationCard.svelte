<script lang="ts">
  import { enhance } from "$app/forms";
  import type {
    AdminSeminarItem,
    AdminSeminarOperationResult,
  } from "$lib/domain/admin-seminars";

  interface Props {
    seminar: AdminSeminarItem;
    onSchedule: (seminar: AdminSeminarItem) => void;
    onTransition: (result: AdminSeminarOperationResult) => void;
    onError: (message: string) => void;
  }

  let { seminar, onSchedule, onTransition, onError }: Props = $props();
  let processing = $state(false);

  /**
   * 실패를 한 문장으로 뭉개면 "다시 누르세요"와 "권한이 없습니다"가 같은 말이
   * 된다. 서버가 코드를 보내 주므로 그대로 옮긴다.
   */
  function cancelFailure(result: { data?: unknown }) {
    const code = (result.data as { error?: string } | undefined)?.error;
    if (code === "CONFLICT")
      return "이미 시작된 세미나입니다. 화면을 새로고침한 뒤 다시 시도해 주세요.";
    if (code === "FORBIDDEN") return "이 세미나를 취소할 권한이 없습니다.";
    if (code === "UNAUTHORIZED")
      return "로그인이 풀렸습니다. 다시 로그인한 뒤 시도해 주세요.";
    if (code === "NOT_FOUND") return "이미 삭제된 세미나입니다.";
    return "세미나를 취소하지 못했습니다.";
  }

  /**
   * 시작 여부는 **누르는 시각**으로 판단한다. 화면이 로드될 때 서버가 계산한
   * 값을 그대로 쓰면, 그 사이에 시작 시각이 지난 세미나는 두 번째 확인 없이
   * 전송되고 서버가 409로 거절한다 — 새로고침 전에는 몇 번을 눌러도 같다.
   * 일정을 잃은 공개 행은 이미 치른 것으로 읽는다(서버와 같은 규칙).
   */
  function hasStartedNow() {
    if (!seminar.schedule) return seminar.publicationStatus === "published";
    return new Date(seminar.schedule.startsAt).getTime() <= Date.now();
  }

  const statusLabel = $derived.by(() => {
    switch (seminar.publicationStatus) {
      case "unscheduled":
        return "일정 미정";
      case "scheduled":
        return "공개 준비";
      case "published":
        return "공개됨";
      case "cancelled":
        return "취소";
    }
  });

  function formatSchedule(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatScheduleRange(startsAt: string, endsAt: string | null) {
    const start = formatSchedule(startsAt);
    if (!endsAt) return start;

    return `${start} – ${new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(endsAt))}`;
  }
</script>

<article class="publication-card" data-status={seminar.publicationStatus}>
  <header class="card-heading">
    <div>
      <p class="eyebrow">Seminar · {seminar.kind === "regular" ? "Regular" : "Irregular"}</p>
      <h3>{seminar.title}</h3>
    </div>
    <span class="status-chip">{statusLabel}</span>
  </header>

  <p class="presenters">
    {seminar.presenters.map((presenter) => presenter.name).join(", ")}
    <span>· {seminar.duration}</span>
  </p>

  {#if seminar.schedule}
    <div class="schedule-sheet">
      <div>
        <span>일시</span>
        <strong>{formatScheduleRange(seminar.schedule.startsAt, seminar.schedule.endsAt)}</strong>
      </div>
      <div>
        <span>장소</span>
        <strong>{seminar.schedule.location}</strong>
      </div>
    </div>
  {:else}
    <p class="unscheduled-note">승인은 완료되었습니다. 발표자와 조율한 일정을 입력해 주세요.</p>
  {/if}

  {#if seminar.publicationStatus === "published"}
    <dl class="linkage">
      <div><dt>Activity</dt><dd>{seminar.activityId}</dd></div>
      <div><dt>Event</dt><dd>{seminar.eventId}</dd></div>
    </dl>
  {/if}

  <div class="card-actions">
    {#if seminar.canCancel}
      <form
        method="POST"
        action="?/cancelSeminar"
        use:enhance={({ formData, cancel }) => {
          if (
            !confirm(
              `‘${seminar.title}’ 세미나를 취소합니다. 회원과 공개 아카이브에서 사라집니다.`,
            )
          ) {
            cancel();
            return;
          }
          if (hasStartedNow()) {
            if (
              !confirm(
                "이 세미나는 이미 시작된 일정입니다. 출석 기록은 관리자에게만 남습니다. 정말 취소하시겠습니까?",
              )
            ) {
              cancel();
              return;
            }
            // 서버가 이 값을 독립적으로 검사한다 — 대화상자만으로는
            // 보장이 되지 않는다.
            formData.set("acknowledgeStarted", "yes");
          }
          processing = true;
          return async ({ result, update }) => {
            processing = false;
            if (result.type === "success") {
              await update({ reset: false });
              onTransition(result.data as AdminSeminarOperationResult);
            } else {
              onError(cancelFailure(result as { data?: unknown }));
            }
          };
        }}
      >
        <input type="hidden" name="seminarId" value={seminar.id} />
        <button class="paper-btn danger" type="submit" disabled={processing}
          >취소</button>
      </form>
    {/if}

    {#if seminar.canSchedule}
      <button class="paper-btn secondary" onclick={() => onSchedule(seminar)}>
        {seminar.schedule ? "일정 수정" : "일정 입력"}
      </button>
    {/if}

    {#if seminar.canPublish}
      <form
        method="POST"
        action="?/publishSeminar"
        use:enhance={() => {
          processing = true;
          return async ({ result, update }) => {
            processing = false;
            if (result.type === "success") {
              await update({ reset: false });
              const payload = result.data as AdminSeminarOperationResult;
              // 서버는 전 회원 메일 실패를 정직하게 보고한다 — 삼키면 관리자가
              // 재발송이 필요하다는 사실을 알 길이 없다.
              if ("mailFailed" in payload && payload.mailFailed) {
                onError("세미나는 공개했지만 전 회원 공지 발송에 실패했습니다. 다시 공개를 눌러 재발송할 수 있습니다.");
              }
              onTransition(payload);
            } else {
              onError("세미나를 공개하지 못했습니다.");
            }
          };
        }}
      >
        <input type="hidden" name="seminarId" value={seminar.id} />
        <button class="paper-btn primary" disabled={processing}>
          {processing ? "공개 중…" : "활동·출석 이벤트 공개"}
        </button>
      </form>
    {/if}
  </div>

  {#if seminar.publicationStatus === "published"}
    <p class="mail-note">공개된 일정을 수정하면 출석 이벤트와 공개 아카이브가 함께 갱신됩니다.</p>
  {:else if seminar.publicationStatus === "scheduled"}
    <p class="mail-note">공개할 때 전 회원에게 확정 일정 안내 메일을 보냅니다.</p>
  {:else if seminar.publicationStatus === "unscheduled"}
    <p class="mail-note">일정 저장은 비공개 초안이며, 공개할 때 확정 일정 안내를 보냅니다.</p>
  {/if}
</article>

<style>
  .publication-card {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--latex-rule);
    background: var(--latex-bg);
  }

  .publication-card[data-status="unscheduled"] {
    border-top: 3px solid var(--latex-accent);
  }

  .publication-card[data-status="scheduled"] {
    border-top: 3px solid var(--latex-text);
  }

  .publication-card[data-status="published"] {
    border-left: 3px double var(--latex-rule);
    color: var(--latex-muted);
  }

  .card-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .eyebrow {
    margin: 0 0 0.22rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h3 {
    margin: 0;
    color: var(--latex-text);
    font-family: var(--font-display);
    font-size: 1.03rem;
    font-weight: 560;
    line-height: 1.42;
  }

  .status-chip {
    flex: 0 0 auto;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .presenters {
    margin: 0;
    color: var(--latex-text);
    font-size: 0.82rem;
  }

  .presenters span {
    color: var(--latex-muted);
  }

  .schedule-sheet {
    display: grid;
    gap: 0.45rem;
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
    background: color-mix(in srgb, var(--latex-bg) 96%, var(--latex-text));
  }

  .schedule-sheet div {
    display: grid;
    grid-template-columns: 2.5rem 1fr;
    gap: 0.55rem;
  }

  .schedule-sheet span,
  dt {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .schedule-sheet strong {
    font-size: 0.82rem;
    font-weight: 560;
  }

  .unscheduled-note,
  .mail-note {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.75rem;
    line-height: 1.55;
  }

  .unscheduled-note {
    padding-left: 0.55rem;
    border-left: 2px solid var(--latex-accent);
  }

  .linkage {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
    margin: 0;
  }

  .linkage div {
    min-width: 0;
  }

  dd {
    margin: 0.12rem 0 0;
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    text-overflow: ellipsis;
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .card-actions form {
    margin: 0;
  }

  @media (max-width: 520px) {
    .card-heading {
      flex-direction: column;
    }

    .card-actions,
    .card-actions form,
    .card-actions :global(button) {
      width: 100%;
    }
  }
</style>
