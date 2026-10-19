// Jodit 편집기 마운트. 브라우저에서만 호출한다(SSR에서 import 금지: 동적 import 사용).
// 설정은 보존 시험(scripts/measure/editor-preservation.py)을 통과한 기본값 + iframe 모드.

export type EmlEditor = {
  getHtml(): string;
  setReadOnly(v: boolean): void;
  destroy(): void;
};

export async function mountEmlEditor(
  el: HTMLElement,
  html: string,
  onChange: () => void,
): Promise<EmlEditor> {
  const [{ Jodit }] = await Promise.all([
    import("jodit"),
    import("jodit/es2021/jodit.min.css"),
  ]);
  const textarea = document.createElement("textarea");
  el.replaceChildren(textarea);
  const editor = Jodit.make(textarea, { iframe: true, height: 480 });
  // 보존 시험과 같은 순서: 준비 뒤 값을 넣고, 초기 값 주입은 변경으로 세지 않는다.
  try {
    await editor.waitForReady();
    editor.value = html;
    await new Promise((r) => setTimeout(r, 300));
    editor.events.on("change", onChange);
  } catch (error) {
    editor.destruct();
    el.replaceChildren();
    throw error;
  }
  return {
    getHtml: () => editor.value,
    setReadOnly: (v) => editor.setReadOnly(v),
    destroy: () => {
      editor.destruct();
      el.replaceChildren();
    },
  };
}
