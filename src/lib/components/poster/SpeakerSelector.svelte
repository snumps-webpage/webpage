<script lang="ts">
  import {
    SEMINAR_MAX_PRESENTERS,
    type MemberPickerItem,
  } from "$lib/domain/seminars";
  let {
    selectedSpeakers = $bindable([]),
    members = [],
    memberDirectoryUnavailable = false,
    showSearch = $bindable(false),
    error,
    onChange = () => {},
  }: {
    selectedSpeakers: MemberPickerItem[];
    members: MemberPickerItem[];
    memberDirectoryUnavailable: boolean;
    showSearch: boolean;
    error?: string;
    onChange?: () => void;
  } = $props();
  let searchQuery = $state("");
  let searchInput = $state<HTMLInputElement>();
  const selectedIds = $derived(
    new Set(selectedSpeakers.map((speaker) => speaker.id)),
  );
  const displayedSpeakers = $derived(
    selectedSpeakers.map(
      (speaker) =>
        members.find((member) => member.id === speaker.id) ?? speaker,
    ),
  );
  const memberIds = $derived(new Set(members.map((member) => member.id)));
  const options = $derived([
    ...selectedSpeakers.filter((speaker) => !memberIds.has(speaker.id)),
    ...members,
  ]);
  const query = $derived(searchQuery.trim().toLocaleLowerCase());
  const visible = $derived(
    options.filter(
      (member) =>
        !query ||
        `${member.name} ${member.department}`
          .toLocaleLowerCase()
          .includes(query),
    ),
  );
  function select(member: MemberPickerItem, checked: boolean) {
    if (checked) {
      if (
        selectedIds.has(member.id) ||
        selectedSpeakers.length >= SEMINAR_MAX_PRESENTERS
      )
        return;
      selectedSpeakers = [...selectedSpeakers, member];
    } else
      selectedSpeakers = selectedSpeakers.filter(
        (speaker) => speaker.id !== member.id,
      );
    onChange();
  }
</script>

<div class="speaker-selector">
  <p class="presenter-count">
    {selectedSpeakers.length}명 선택 · 최소 1명, 최대 {SEMINAR_MAX_PRESENTERS}명
  </p>
  {#if selectedSpeakers.length > 0}<ul
      class="selected-speakers"
      aria-label="현재 선택한 발표자"
    >
      {#each displayedSpeakers as speaker (speaker.id)}<li>
          <span>{speaker.name}</span><small>{speaker.department}</small>
        </li>{/each}
    </ul>{:else}<p class="paper-hint">
      발표자를 한 명 이상 선택해 주세요. 신청자도 선택하거나 해제할 수 있습니다.
    </p>{/if}
  <details class="presenter-picker" bind:open={showSearch}>
    <summary>발표자 선택·변경</summary>
    <div class="presenter-search">
      <label for="presenter-search">이름 또는 학과 검색</label>
      <input
        id="presenter-search"
        bind:this={searchInput}
        type="search"
        bind:value={searchQuery}
        onkeydown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
      {#if query}<button
          type="button"
          class="clear-presenter-search"
          onclick={() => {
            searchQuery = "";
            searchInput?.focus();
          }}>검색 지우기</button
        >{/if}
      <p class="paper-hint" aria-live="polite">
        검색 결과 {visible.length}명 · 검색은 선택한 발표자를 해제하지 않습니다.
      </p>
    </div>
    <fieldset
      class="presenter-options"
      aria-describedby={error ? "presenter-error" : "presenter-hint"}
      disabled={memberDirectoryUnavailable}
    >
      <legend class="sr-only">발표자 선택</legend>
      {#each options as member (member.id)}
        <label
          class="presenter-option"
          hidden={!!query &&
            !`${member.name} ${member.department}`
              .toLocaleLowerCase()
              .includes(query)}
        >
          <input
            type="checkbox"
            name="speakerIds"
            value={member.id}
            checked={selectedIds.has(member.id)}
            disabled={!selectedIds.has(member.id) &&
              selectedSpeakers.length >= SEMINAR_MAX_PRESENTERS}
            aria-invalid={!!error}
            onchange={(event) => select(member, event.currentTarget.checked)}
          />
          <span
            ><strong>{member.name}</strong><small>{member.department}</small
            ></span
          >
        </label>
      {/each}
    </fieldset>
    {#if query && visible.length === 0}<p class="paper-hint">
        검색에 맞는 회원이 없습니다. 이름이나 학과의 일부로 다시 검색해 주세요.
      </p>{/if}
    <p class="paper-hint" id="presenter-hint">
      체크한 회원을 발표자로 제출합니다. 검색을 닫아도 선택은 유지됩니다.
    </p>
  </details>
  <noscript
    ><p class="paper-hint">
      발표자 선택·변경을 펼쳐 체크를 바꾸면 JavaScript 없이도 제출할 수
      있습니다. 검색은 JavaScript가 필요합니다.
    </p></noscript
  >
  {#if error}<p class="field-error" id="presenter-error" role="alert">
      {error}
    </p>{/if}
</div>

<style>
  .speaker-selector {
    display: grid;
    gap: 0.7rem;
  }
  .presenter-count {
    margin: 0;
    color: var(--latex-muted);
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .selected-speakers {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .selected-speakers li {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.2rem 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--latex-rule);
    font-size: 0.9rem;
  }
  small {
    color: var(--latex-muted);
    font-family: var(--font-ui);
    font-size: 0.75rem;
  }
  summary {
    min-height: 2.75rem;
    padding: 0.6rem 0;
    cursor: pointer;
    user-select: none;
    font-family: var(--font-ui);
    font-size: 0.82rem;
  }
  summary:focus-visible {
    outline: 2px solid var(--latex-accent);
    outline-offset: 2px;
  }
  .presenter-search {
    display: grid;
    gap: 0.4rem;
    padding: 0.75rem 0;
  }
  .presenter-search label {
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .presenter-search input {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.65rem;
    border-color: var(--latex-muted);
  }
  .clear-presenter-search {
    justify-self: start;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--latex-muted);
    background: transparent;
    color: var(--latex-text);
    cursor: pointer;
    font-size: 0.75rem;
  }
  .presenter-options {
    margin: 0;
    padding: 0;
    min-width: 0;
    border: 0;
    max-height: 20rem;
    overflow-y: auto;
    border-top: 1px solid var(--latex-rule);
  }
  .presenter-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.7rem;
    align-items: start;
    padding: 0.7rem;
    min-height: 2.75rem;
    border-bottom: 1px solid var(--latex-rule);
    cursor: pointer;
  }
  .presenter-option[hidden] {
    display: none;
  }
  .presenter-option input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0.25rem 0 0;
    accent-color: var(--latex-text);
  }
  .presenter-option span {
    display: grid;
    gap: 0.1rem;
  }
  .presenter-option strong {
    font-weight: 500;
    font-size: 0.9rem;
  }
  .field-error {
    margin: 0;
    color: var(--latex-accent);
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
