<script lang="ts">
  import type { AdminStudyRecord } from "$lib/domain/admin-records";
  import AdminDirectUploadForm from "$lib/components/admin/AdminDirectUploadForm.svelte";

  export interface StudyRecordFormState {
    success?: boolean;
    operation?: string;
    scope?: string;
    id?: string;
    error?: string;
    issues?: Record<string, string>;
    values?: Record<string, string>;
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
    records: AdminStudyRecord[];
    members: MemberOption[];
    currentTerm: string;
    form?: StudyRecordFormState | null;
  } = $props();

  let query = $state("");
  const filtered = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return records.filter(
      (record) =>
        !normalized ||
        [record.title, record.term, ...record.organizerNames].some((value) =>
          value.toLocaleLowerCase("ko-KR").includes(normalized),
        ),
    );
  });
  const issuesFor = (scope: string, id?: string) =>
    form?.scope === scope && (id === undefined || form.id === id)
      ? (form.issues ?? {})
      : {};
  const createIssues = $derived(issuesFor("record-create"));
  const messages: Record<string, string> = {
    studyRecordCreated: "스터디 레코드를 생성했습니다.",
    studyRecordUpdated: "스터디 기본 정보를 수정했습니다.",
    studyOrganizerSet: "주최자를 변경하고 대기 중인 양도를 취소했습니다.",
    studyFileAdded: "스터디 파일 메타데이터를 등록했습니다.",
    studyFileRemoved: "스터디 파일 연결을 제거했습니다.",
    studyRecordDeleted: "스터디 레코드를 삭제했습니다.",
  };
</script>

<section class="record-editor" aria-labelledby="study-record-heading">
  <header class="editor-heading">
    <div>
      <p>02 · Records</p>
      <h2 id="study-record-heading">스터디 레코드 편집</h2>
    </div>
    <span>공개 목록과 운영 화면이 같은 레코드를 사용합니다.</span>
  </header>

  {#if form?.success && form.operation && messages[form.operation]}
    <p class="paper-status-note success" role="status">
      {messages[form.operation]}
    </p>
  {/if}
  {#if form?.error === "CONFLICT" && form.scope === "record-delete"}
    <p class="paper-status-note error" role="alert">
      출석 회차가 있는 스터디는 삭제할 수 없습니다.
    </p>
  {/if}

  <details class="create-record" open={form?.scope === "record-create"}>
    <summary>새 스터디 레코드 생성</summary>
    <form method="POST" action="?/create" class="record-form">
      <div class="field-grid">
        <label class="title-field">
          <span class="paper-label">제목</span>
          <input
            name="title"
            value={form?.scope === "record-create"
              ? (form.values?.title ?? "")
              : ""}
            aria-invalid={!!createIssues.title}
          />
          {#if createIssues.title}<small>{createIssues.title}</small>{/if}
        </label>
        <label>
          <span class="paper-label">학기</span>
          <input
            name="term"
            value={form?.scope === "record-create"
              ? (form.values?.term ?? currentTerm)
              : currentTerm}
            aria-invalid={!!createIssues.term}
          />
          {#if createIssues.term}<small>{createIssues.term}</small>{/if}
        </label>
        <label>
          <span class="paper-label">주최자</span>
          <select name="organizerId" aria-invalid={!!createIssues.organizerId}>
            <option value="">회원 선택</option>
            {#each members as member (member.id)}
              <option
                value={member.id}
                selected={form?.scope === "record-create" &&
                  form.values?.organizerId === member.id}
                >{member.name} · {member.department}</option
              >
            {/each}
          </select>
          {#if createIssues.organizerId}<small>{createIssues.organizerId}</small
            >{/if}
        </label>
        <label class="wide">
          <span class="paper-label">설명</span>
          <textarea
            name="description"
            rows="3"
            aria-invalid={!!createIssues.description}
            >{form?.scope === "record-create"
              ? (form.values?.description ?? "")
              : ""}</textarea
          >
          {#if createIssues.description}<small>{createIssues.description}</small
            >{/if}
        </label>
        <label class="wide">
          <span class="paper-label">교재·자료</span>
          <input
            name="material"
            value={form?.scope === "record-create"
              ? (form.values?.material ?? "")
              : ""}
            aria-invalid={!!createIssues.material}
          />
          {#if createIssues.material}<small>{createIssues.material}</small>{/if}
        </label>
      </div>
      <button class="paper-btn primary" type="submit">레코드 생성</button>
    </form>
  </details>

  <div class="record-tools">
    <label
      ><span class="paper-label">레코드 검색</span><input
        type="search"
        bind:value={query}
        placeholder="제목, 학기, 주최자"
      /></label
    >
    <span>{filtered.length} / {records.length}</span>
  </div>

  <div class="record-list">
    {#each filtered as record (record.id)}
      {@const updateIssues = issuesFor("record-update", record.id)}
      {@const fileIssues = issuesFor("record-file", record.id)}
      <details class="record-card">
        <summary>
          <div>
            <span>{record.term} · 회차 {record.sessionCount}개</span><strong
              >{record.title}</strong
            >
          </div>
          <small
            >{record.organizerNames.join(", ")} · 파일 {record.files
              .length}개</small
          >
        </summary>
        <div class="record-body">
          <form method="POST" action="?/update" class="record-form">
            <input type="hidden" name="id" value={record.id} />
            <div class="field-grid">
              <label class="title-field"
                ><span class="paper-label">제목</span><input
                  name="title"
                  value={record.title}
                  aria-invalid={!!updateIssues.title}
                />{#if updateIssues.title}<small>{updateIssues.title}</small
                  >{/if}</label
              >
              <label
                ><span class="paper-label">학기</span><input
                  name="term"
                  value={record.term}
                  aria-invalid={!!updateIssues.term}
                />{#if updateIssues.term}<small>{updateIssues.term}</small
                  >{/if}</label
              >
              <label class="wide"
                ><span class="paper-label">설명</span><textarea
                  name="description"
                  rows="3"
                  aria-invalid={!!updateIssues.description}
                  >{record.description}</textarea
                >{#if updateIssues.description}<small
                    >{updateIssues.description}</small
                  >{/if}</label
              >
              <label class="wide"
                ><span class="paper-label">교재·자료</span><input
                  name="material"
                  value={record.material}
                  aria-invalid={!!updateIssues.material}
                />{#if updateIssues.material}<small
                    >{updateIssues.material}</small
                  >{/if}</label
              >
            </div>
            <button class="paper-btn" type="submit">기본 정보 수정</button>
          </form>

          <section class="organizer-section">
            <div>
              <h3>주최자 강제 변경</h3>
              <p>
                현재 주최자: {record.organizerNames.join(", ")}. 변경하면 대기
                중인 양도 요청은 취소되고 관리자 변경 이력이 남습니다.
              </p>
            </div>
            <form
              method="POST"
              action="?/setOrganizer"
              onsubmit={(event) => {
                if (!confirm("주최자를 변경하고 대기 중인 양도를 취소할까요?"))
                  event.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={record.id} />
              <select name="organizerId" aria-label="새 주최자">
                {#each members as member (member.id)}<option
                    value={member.id}
                    selected={record.organizerIds.includes(member.id)}
                    >{member.name} · {member.department}</option
                  >{/each}
              </select>
              <button class="paper-btn" type="submit">주최자 변경</button>
            </form>
          </section>

          <section class="file-section">
            <h3>교재·활동 자료</h3>
            {#if record.files.length}
              <ul>
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
                        name="fileId"
                        value={file.id}
                      /><button class="paper-btn small" type="submit"
                        >제거</button
                      >
                    </form>
                  </li>{/each}
              </ul>
            {/if}
            <AdminDirectUploadForm
              recordId={record.id}
              action="?/addFile"
              inputName="file"
              accept="image/jpeg,image/png,image/webp"
              label="활동 사진 · JPEG/PNG/WebP · 최대 10MB"
              imagePurpose="study-photo"
              issue={fileIssues.file}
              buttonLabel="사진 등록"
            />
          </section>

          <form
            method="POST"
            action="?/delete"
            class="delete-row"
            onsubmit={(event) => {
              if (!confirm(`'${record.title}' 스터디 레코드를 삭제할까요?`))
                event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={record.id} />
            <span
              >{record.sessionCount > 0
                ? "출석 회차가 있어 삭제 불가"
                : "삭제 시 공개 아카이브에서도 제거"}</span
            >
            <button
              class="paper-btn small"
              type="submit"
              disabled={record.sessionCount > 0}>레코드 삭제</button
            >
          </form>
        </div>
      </details>
    {:else}
      <p class="empty">검색 조건에 맞는 스터디 레코드가 없습니다.</p>
    {/each}
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
  .record-body > .record-form {
    padding: 0 0 0.8rem;
    border-top: 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .field-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 7rem 15rem;
    gap: 0.6rem;
  }
  .field-grid .wide {
    grid-column: 1 / -1;
  }
  .field-grid input,
  .field-grid select,
  .field-grid textarea,
  .record-tools input,
  .organizer-section select {
    width: 100%;
    padding: 0.55rem 0.65rem;
  }
  .field-grid small {
    display: block;
    margin-top: 0.2rem;
    color: var(--color-danger-text);
    font-size: 0.64rem;
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
  .organizer-section,
  .file-section {
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
  }
  .organizer-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.8fr);
    align-items: end;
    gap: 0.8rem;
  }
  .organizer-section h3,
  .file-section h3 {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
    font-weight: 570;
  }
  .organizer-section p {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.7rem;
    line-height: 1.5;
  }
  .organizer-section form {
    display: flex;
    gap: 0.5rem;
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
  .empty {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--latex-rule);
    color: var(--latex-muted);
    text-align: center;
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
    .organizer-section {
      grid-template-columns: 1fr;
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
    .record-card > summary,
    .organizer-section form,
    .delete-row {
      align-items: stretch;
      flex-direction: column;
    }
    .organizer-section button,
    .delete-row button {
      width: 100%;
    }
  }
</style>
