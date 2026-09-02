<script lang="ts">
  import type { AdminSeminarRecord } from "$lib/domain/admin-records";
  import AdminDirectUploadForm from "$lib/components/admin/AdminDirectUploadForm.svelte";
  import PosterUploadField from "$lib/components/poster/PosterUploadField.svelte";

  export interface SeminarRecordFormState {
    success?: boolean;
    operation?: string;
    scope?: string;
    id?: string;
    error?: string;
    issues?: Record<string, string>;
    values?: Record<string, string>;
    presenterIds?: string[];
  }

  interface MemberOption {
    id: string;
    name: string;
    department: string;
  }

  let {
    records,
    members,
    currentTerm,
    form = null,
  }: {
    records: AdminSeminarRecord[];
    members: MemberOption[];
    currentTerm: string;
    form?: SeminarRecordFormState | null;
  } = $props();

  let query = $state("");
  const filtered = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return records.filter(
      (record) =>
        !normalized ||
        [record.title, record.term, record.kind, ...record.presenterNames].some(
          (value) => value.toLocaleLowerCase("ko-KR").includes(normalized),
        ),
    );
  });
  const issuesFor = (scope: string, id?: string) =>
    form?.scope === scope && (id === undefined || form.id === id)
      ? (form.issues ?? {})
      : {};
  const createIssues = $derived(issuesFor("record-create"));
  const messages: Record<string, string> = {
    seminarRecordCreated:
      "세미나 레코드를 생성했습니다. 일정은 위 공개 흐름에서 별도로 입력해 주세요.",
    seminarRecordUpdated: "세미나 기본 정보를 수정했습니다.",
    seminarFileAdded: "세미나 파일 메타데이터를 등록했습니다.",
    seminarFileRemoved: "세미나 파일 연결을 제거했습니다.",
    seminarRecordDeleted: "세미나 레코드를 삭제했습니다.",
  };
  const kindLabel = { regular: "정기", irregular: "비정기" } as const;

  /** The backend action reads one comma-separated `presenterIds` field. */
  function joinPresenterIds(event: FormDataEvent) {
    const ids = event.formData.getAll("presenterIds").map(String);
    event.formData.delete("presenterIds");
    event.formData.set("presenterIds", ids.join(","));
  }

  function scheduleLabel(value: string | null) {
    if (!value) return "일정 미정";
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }).format(new Date(value));
  }
</script>

<section class="record-editor" aria-labelledby="seminar-record-heading">
  <header class="editor-heading">
    <div>
      <p>05 · Records</p>
      <h2 id="seminar-record-heading">세미나 레코드 편집</h2>
    </div>
    <span>승인·일정·공개 흐름과 같은 원본을 사용합니다.</span>
  </header>

  {#if form?.success && form.operation && messages[form.operation]}
    <p class="paper-status-note success" role="status">
      {messages[form.operation]}
    </p>
  {/if}
  {#if form?.error === "CONFLICT"}
    <p class="paper-status-note error" role="alert">
      연결된 활동·출석 이벤트가 있어 삭제할 수 없습니다.
    </p>
  {/if}

  <details class="create-record" open={form?.scope === "record-create"}>
    <summary>새 세미나 레코드 생성</summary>
    <form
      method="POST"
      action="?/create"
      class="record-form"
      onformdata={joinPresenterIds}
    >
      <div class="field-grid">
        <label class="title-field"
          ><span class="paper-label">제목</span><input
            name="title"
            value={form?.scope === "record-create"
              ? (form.values?.title ?? "")
              : ""}
            aria-invalid={!!createIssues.title}
          />{#if createIssues.title}<small>{createIssues.title}</small
            >{/if}</label
        >
        <label
          ><span class="paper-label">학기</span><input
            name="semester"
            value={form?.scope === "record-create"
              ? (form.values?.term ?? currentTerm)
              : currentTerm}
            aria-invalid={!!createIssues.term}
          />{#if createIssues.term}<small>{createIssues.term}</small
            >{/if}</label
        >
        <label
          ><span class="paper-label">구분</span><select name="kind"
            ><option value="regular">정기</option><option
              value="irregular"
              selected={form?.values?.kind === "irregular"}>비정기</option
            ></select
          ></label
        >
        <label
          ><span class="paper-label">소요 시간(분)</span><input
            type="number"
            name="durationMinutes"
            min="10"
            max="600"
            value={form?.scope === "record-create"
              ? (form.values?.durationMinutes ?? "60")
              : "60"}
            aria-invalid={!!createIssues.durationMinutes}
          />{#if createIssues.durationMinutes}<small
              >{createIssues.durationMinutes}</small
            >{/if}</label
        >
        <label class="wide"
          ><span class="paper-label">설명</span><textarea
            name="note"
            rows="3"
            aria-invalid={!!createIssues.description}
            >{form?.scope === "record-create"
              ? (form.values?.description ?? "")
              : ""}</textarea
          >{#if createIssues.description}<small
              >{createIssues.description}</small
            >{/if}</label
        >
        <label class="wide"
          ><span class="paper-label">선수지식</span><input
            name="prerequisites"
            value={form?.scope === "record-create"
              ? (form.values?.prerequisites ?? "")
              : ""}
            aria-invalid={!!createIssues.prerequisites}
          />{#if createIssues.prerequisites}<small
              >{createIssues.prerequisites}</small
            >{/if}</label
        >
      </div>
      <fieldset class="member-picker">
        <legend>발표자</legend>
        <div>
          {#each members as member (member.id)}<label
              ><input
                type="checkbox"
                name="presenterIds"
                value={member.id}
                checked={form?.scope === "record-create" &&
                  form.presenterIds?.includes(member.id)}
              /><span>{member.name}<small>{member.department}</small></span
              ></label
            >{/each}
        </div>
        {#if createIssues.presenterIds}<small class="field-error"
            >{createIssues.presenterIds}</small
          >{/if}
      </fieldset>
      <div class="poster-field">
        <span class="paper-label">포스터 (선택 · PNG/JPEG)</span>
        <PosterUploadField label="포스터 파일 (선택 · 최대 15MB)" />
      </div>
      <button class="paper-btn primary" type="submit">레코드 생성</button>
    </form>
  </details>

  <div class="record-tools">
    <label
      ><span class="paper-label">레코드 검색</span><input
        type="search"
        bind:value={query}
        placeholder="제목, 학기, 발표자"
      /></label
    ><span>{filtered.length} / {records.length}</span>
  </div>

  <div class="record-list">
    {#each filtered as record (record.id)}
      {@const updateIssues = issuesFor("record-update", record.id)}
      {@const fileIssues = issuesFor("record-file", record.id)}
      <details class="record-card">
        <summary
          ><div>
            <span
              >{record.term} · {kindLabel[record.kind]} · {scheduleLabel(
                record.scheduledAt,
              )}</span
            ><strong>{record.title}</strong>
          </div>
          <small
            >{record.presenterNames.join(", ")} · 파일 {record.files
              .length}개</small
          ></summary
        >
        <div class="record-body">
          <form
            method="POST"
            action="?/update"
            class="record-form"
            onformdata={joinPresenterIds}
          >
            <input type="hidden" name="id" value={record.id} />
            <div class="field-grid">
              <label class="title-field"
                ><span class="paper-label">제목</span><input
                  name="title"
                  value={record.title}
                  aria-invalid={!!updateIssues.title}
                />{#if updateIssues.title}<small>{updateIssues.title}</small
                  >{/if}</label
              ><label
                ><span class="paper-label">학기</span><input
                  name="semester"
                  value={record.term}
                /></label
              ><label
                ><span class="paper-label">구분</span><select name="kind"
                  ><option value="regular" selected={record.kind === "regular"}
                    >정기</option
                  ><option
                    value="irregular"
                    selected={record.kind === "irregular"}>비정기</option
                  ></select
                ></label
              ><label
                ><span class="paper-label">소요 시간(분)</span><input
                  type="number"
                  name="durationMinutes"
                  min="10"
                  max="600"
                  value={record.durationMinutes}
                /></label
              ><label
                ><span class="paper-label">선호 시점 (신청자 제출)</span><input
                  value={record.preferredTiming || "미선택"}
                  readonly
                /></label
              ><label class="wide"
                ><span class="paper-label">설명</span><textarea
                  name="note"
                  rows="3">{record.description}</textarea
                ></label
              ><label class="wide"
                ><span class="paper-label">선수지식</span><input
                  name="prerequisites"
                  value={record.prerequisites}
                /></label
              >
            </div>
            <fieldset class="member-picker">
              <legend>발표자</legend>
              <div>
                {#each members as member (member.id)}<label
                    ><input
                      type="checkbox"
                      name="presenterIds"
                      value={member.id}
                      checked={record.presenterIds.includes(member.id)}
                    /><span
                      >{member.name}<small>{member.department}</small></span
                    ></label
                  >{/each}
              </div>
              {#if updateIssues.presenterIds}<small class="field-error"
                  >{updateIssues.presenterIds}</small
                >{/if}
            </fieldset>
            <button class="paper-btn" type="submit">기본 정보 수정</button>
          </form>

          <section class="file-section">
            <h3>강의 자료·사진</h3>
            {#if record.files.length}<ul>
                {#each record.files as file (file.id)}<li>
                    <div>
                      <strong>{file.name}</strong><span
                        >{file.kind} · {(file.size / 1024).toFixed(1)} KB</span
                      >
                    </div>
                    <form
                      method="POST"
                      action="?/removeFile"
                      onsubmit={(event) => {
                        if (!confirm("파일 연결을 제거할까요?"))
                          event.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={record.id} /><input
                        type="hidden"
                        name="s3Key"
                        value={file.id}
                      /><input
                        type="hidden"
                        name="field"
                        value={file.kind === "pdf" ? "materials" : "photos"}
                      /><button class="paper-btn small" type="submit"
                        >제거</button
                      >
                    </form>
                  </li>{/each}
              </ul>{/if}
            <AdminDirectUploadForm
              recordId={record.id}
              action="?/addFile"
              inputName="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              label="PDF 50MB 이하 · 이미지 10MB 이하"
              imagePurpose="seminar-photo"
              documentPurpose="seminar-material"
              issue={fileIssues.file}
              buttonLabel="파일 등록"
            />
          </section>

          <form
            method="POST"
            action="?/delete"
            class="delete-row"
            onsubmit={(event) => {
              if (!confirm(`'${record.title}' 세미나 레코드를 삭제할까요?`))
                event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={record.id} /><span
              >{record.activityId || record.eventId
                ? "연결된 활동·이벤트가 있어 삭제 불가"
                : "삭제 시 공개 아카이브에서도 제거"}</span
            ><button
              class="paper-btn small"
              type="submit"
              disabled={!!record.activityId || !!record.eventId}
              >레코드 삭제</button
            >
          </form>
        </div>
      </details>
    {:else}<p class="empty">
        검색 조건에 맞는 세미나 레코드가 없습니다.
      </p>{/each}
  </div>
</section>

<style>
  .record-editor {
    margin-top: 1.6rem;
    padding-top: 1rem;
    border-top: 2px solid var(--latex-rule);
  }
  .editor-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }
  .editor-heading p,
  .editor-heading h2,
  .editor-heading > span {
    margin: 0;
  }
  .editor-heading p {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .editor-heading h2 {
    font-size: 1.2rem;
    font-weight: 570;
  }
  .editor-heading > span {
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  .create-record,
  .record-card {
    border: 1px solid var(--latex-rule);
  }
  .create-record {
    margin-bottom: 0.8rem;
  }
  .create-record > summary,
  .record-card > summary {
    padding: 0.7rem 0.8rem;
    cursor: pointer;
  }
  .create-record > summary {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
  }
  .record-form,
  .record-body {
    display: grid;
    gap: 0.8rem;
    padding: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  .field-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 7rem 8rem 8rem;
    gap: 0.6rem;
  }
  .field-grid .wide {
    grid-column: 1 / -1;
  }
  .field-grid input,
  .field-grid select,
  .field-grid textarea,
  .record-tools input {
    width: 100%;
    padding: 0.55rem 0.65rem;
  }
  .field-grid small,
  .field-error {
    display: block;
    margin-top: 0.2rem;
    color: var(--color-danger-text);
    font-size: 0.64rem;
  }
  .member-picker {
    margin: 0;
    padding: 0.65rem;
    border: 1px solid var(--latex-rule);
  }
  .member-picker legend {
    padding: 0 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
  }
  .member-picker > div {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
  }
  .member-picker label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem;
    border: 1px solid color-mix(in srgb, var(--latex-rule) 28%, transparent);
  }
  .member-picker input {
    margin: 0;
  }
  .member-picker span {
    display: grid;
    font-size: 0.7rem;
  }
  .member-picker span small {
    color: var(--latex-muted);
    font-size: 0.55rem;
  }
  .record-tools {
    display: flex;
    align-items: end;
    gap: 0.7rem;
    margin-bottom: 0.65rem;
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
  }
  .record-tools label {
    flex: 1;
  }
  .record-tools > span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
  }
  .record-list {
    display: grid;
    gap: 0.5rem;
  }
  .record-card > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .record-card summary div {
    display: grid;
  }
  .record-card summary span,
  .record-card summary small,
  .delete-row span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
  }
  .record-card summary strong {
    font-size: 0.92rem;
    font-weight: 570;
  }
  .file-section {
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
  }
  .file-section h3 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    font-weight: 570;
  }
  .file-section ul {
    margin: 0 0 0.6rem;
    padding: 0;
    list-style: none;
  }
  .file-section li,
  .delete-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
  }
  .file-section li {
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .file-section li div {
    display: grid;
  }
  .file-section li strong {
    font-size: 0.72rem;
  }
  .file-section li span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.55rem;
  }
  .delete-row {
    padding-top: 0.7rem;
    border-top: 1px solid var(--latex-rule);
  }
  @media (max-width: 760px) {
    .editor-heading {
      align-items: start;
      flex-direction: column;
    }
    .field-grid {
      grid-template-columns: 1fr 1fr;
    }
    .field-grid .title-field,
    .field-grid .wide {
      grid-column: 1 / -1;
    }
    .member-picker > div {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 520px) {
    .field-grid {
      grid-template-columns: 1fr;
    }
    .field-grid .title-field,
    .field-grid .wide {
      grid-column: auto;
    }
    .member-picker > div {
      grid-template-columns: 1fr;
    }
    .record-card > summary,
    .delete-row {
      align-items: stretch;
      flex-direction: column;
    }
    .delete-row button {
      width: 100%;
    }
  }
</style>
