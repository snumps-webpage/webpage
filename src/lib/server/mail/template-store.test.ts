import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { MAIL_TEMPLATE_DEFAULTS, renderMailTemplate } from "./template-store";

function seedOverrides(rows: unknown[]) {
  __putRawDoc("table", "mail-templates", { schemaVersion: 1, rows });
}
function seedVariables(rows: unknown[]) {
  __putRawDoc("table", "mail-variables", { schemaVersion: 1, rows });
}

describe("mail template store", () => {
  beforeEach(async () => {
    __reset();
    _resetDataLayerForTests();
    await invalidateCache("table_mail-templates");
    await invalidateCache("table_mail-variables");
    seedOverrides([]);
    seedVariables([]);
  });

  it("renders the code default with variables when no override exists", async () => {
    const r = await renderMailTemplate("welcome", { name: "김수학" });
    expect(r).not.toBeNull();
    expect(r!.subject).toBe("[SNUMPS] 가입이 승인되었습니다!");
    expect(r!.body).toContain("김수학님!");
    expect(r!.body).not.toContain("{{"); // 공용 변수(채팅방 링크)까지 전부 치환
  });

  it("prefers a DB override and interpolates it", async () => {
    seedOverrides([
      {
        id: "t1",
        key: "welcome",
        subject: "환영합니다 {{name}}",
        body: "{{name}}님, 새 문구입니다.",
        enabled: true,
        updatedAt: "2026-08-31T00:00:00+09:00",
      },
    ]);
    const r = await renderMailTemplate("welcome", { name: "김수학" });
    expect(r!.subject).toBe("환영합니다 김수학");
    expect(r!.body).toBe("김수학님, 새 문구입니다.");
  });

  it("returns null when the template is disabled (send is skipped)", async () => {
    seedOverrides([
      {
        id: "t1",
        key: "welcome",
        subject: "x",
        body: "y",
        enabled: false,
        updatedAt: "2026-08-31T00:00:00+09:00",
      },
    ]);
    expect(await renderMailTemplate("welcome", { name: "김수학" })).toBeNull();
  });

  it("replaces unknown variables with an empty string, never the raw token", async () => {
    seedOverrides([
      {
        id: "t1",
        key: "welcome",
        subject: "{{nope}}제목",
        body: "본문 {{name}} {{nope}}",
        enabled: true,
        updatedAt: "2026-08-31T00:00:00+09:00",
      },
    ]);
    const r = await renderMailTemplate("welcome", { name: "A" });
    expect(r!.subject).toBe("제목");
    expect(r!.body).toBe("본문 A ");
  });

  it("a DB variable overrides the code default inside any template", async () => {
    seedVariables([
      {
        id: "v1",
        key: "noticeChatLink",
        value: "https://new.link/notice",
        description: "",
        updatedAt: "2026-08-31T00:00:00+09:00",
      },
    ]);
    const r = await renderMailTemplate("welcome", { name: "A" });
    expect(r!.body).toContain("https://new.link/notice");
  });

  it("every default template's declared variables appear in its text", () => {
    for (const [key, def] of Object.entries(MAIL_TEMPLATE_DEFAULTS)) {
      for (const v of def.variables) {
        expect(
          def.subject.includes(`{{${v}}}`) || def.body.includes(`{{${v}}}`),
          `${key}: {{${v}}}`,
        ).toBe(true);
      }
    }
  });
});
