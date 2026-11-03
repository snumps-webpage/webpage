// Execute the actual operator module with only external I/O replaced.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as zod from "zod";
import * as zod4 from "zod/v4";
const [scenario, root] = process.argv.slice(2);
const messages = [];
const effects = [];
let status = 0;
const stop = new Error("synthetic process exit");
process.on("unhandledRejection", (error) => {
  if (error !== stop) throw error;
});
const proc = {
  env: {
    SUPABASE_URL: "https://synthetic.invalid",
    SUPABASE_SECRET_KEY: "control",
    PUBKEY: "public",
    NOTION_API_KEY: "synthetic",
    NOTION_DB_SEMINARS: "db",
  },
  argv: ["node", "operator"],
  stdin: { isTTY: true },
  stdout: {},
  exit(code) {
    status = code;
    throw stop;
  },
  set exitCode(code) {
    status = code;
  },
  get exitCode() {
    return status;
  },
};
const client = {
  from(_name) {
    const result =
      scenario === "clean-read-error"
        ? { data: null, error: { code: "503", message: "synthetic outage" } }
        : { data: [], error: null };
    return {
      select() {
        return this;
      },
      order() {
        return this;
      },
      eq() {
        return this;
      },
      limit() {
        return Promise.resolve(result);
      },
      maybeSingle: async () => result,
      range: async () => ({ ...result, count: 0 }),
      insert: async () => ({
        error: {
          code: "42501",
          message: "new row violates row-level security policy",
        },
      }),
    };
  },
  rpc: async (name) => {
    effects.push(name);
    return {
      data: {
        app_tables: [
          { name: "activities", doc: { rows: [{ attendeeIds: ["member"] }] } },
        ],
        app_queues: [
          { event_id: "event", doc: { rows: [{ status: "approved" }] } },
        ],
        audit_log: [],
      },
      error: null,
    };
  },
};
const control = {
  from: () => ({
    select() {
      return this;
    },
    limit: async () => ({ data: [{ id: "known" }], error: null }),
  }),
  storage: {
    from: () => ({
      list: async () => ({
        data: [{ name: "known.png", id: "known" }],
        error: null,
      }),
    }),
  },
};
client.storage = {
  from: () => ({ list: async () => ({ data: [], error: null }) }),
};
const bad = async () => ({
  data: null,
  error: { code: "PGRST301", message: "Invalid API key" },
  status: 401,
});
if (scenario === "rls-bad-key") {
  client.from = () => ({
    select() {
      return this;
    },
    limit: bad,
    insert: bad,
  });
  client.storage = { from: () => ({ list: bad }) };
}
if (scenario === "rls-no-control") delete proc.env.SUPABASE_SECRET_KEY;
const tableRows = [
  {
    id: "s1",
    title: "Synthetic",
    semester: "26-2",
    videos: [],
    prerequisites: "",
    duration_minutes: null,
  },
];
const mocks = {
  zod,
  "zod/v4": zod4,
  "@supabase/supabase-js": {
    createClient: (_url, key) =>
      scenario.startsWith("rls-") && key === "control" ? control : client,
  },
  "./lib-env.mjs": {
    loadDotenv() {},
    REPO_ROOT: root,
    requireSupabase: async (opts) => (opts?.optional ? null : client),
  },
  "./lib-supabase-cli.mjs": {
    REF: { prod: "prod", dev: "dev" },
    queryFor: () => (sql) => {
      if (sql.includes("flow_update_seminar_record"))
        throw new Error("synthetic failed write");
      return tableRows;
    },
  },
  "node:readline/promises": {
    createInterface: () => ({ question: async () => "yes", close() {} }),
  },
};
if (scenario.startsWith("smoke")) {
  proc.env.BASE = "http://localhost:5199";
  const tables = [
    [
      "seminars",
      scenario === "smoke-hidden"
        ? [{ id: "draft", publicationStatus: "draft" }]
        : [{ id: "seminar", publicationStatus: "published" }],
    ],
    ["studies", [{ id: "study" }]],
    [
      "members",
      scenario === "smoke-hidden"
        ? [
            { id: "withdrawn", status: "withdrawn" },
            { id: "member", status: "regular" },
          ]
        : [{ id: "member", status: "regular" }],
    ],
    ["seminar-series", [{ id: "series" }]],
  ].map(([name, rows]) => ({ name, doc: { rows } }));
  mocks["./lib-env.mjs"].requireSupabase = async () => ({
    from: () => ({ select: async () => ({ data: tables, error: null }) }),
  });
}
if (scenario === "body-write-error") {
  const answers = ["y", "yes"];
  mocks["node:readline/promises"].createInterface = () => ({
    question: async () => answers.shift() ?? "n",
    close() {},
  });
}
const db = new Map([
  [
    "members",
    { name: "members", version: 42, doc: { rows: [{ id: "operational" }] } },
  ],
  [
    "private-info",
    { name: "private-info", version: 42, doc: { rows: [{ id: "private" }] } },
  ],
]);
if (scenario === "migration" || scenario === "migration-invalid") {
  mocks["./lib"] = {
    currentTerm: () => "26-2",
    filesOf: (prop) => prop?.files ?? [],
    hasFlag: () => false,
    optValue: () => null,
    id: () => "synthetic-id",
    idFor: (_, value) => value,
    kstISO: () => "2026-11-04T00:00:00+09:00",
    loadDotenv() {},
    loadIdMap: () => ({}),
    loadManifest: () => ({
      "https://synthetic.invalid/photo.png": { key: "gallery/synthetic.png" },
    }),
    notionUrlHash: (x) => x,
    propValue: (x) => x,
    readDump: (_, name) =>
      ({
        members: {
          pages: [{ id: "legacy", properties: { 이름: "Synthetic" } }],
        },
        "private-info": {
          pages: [
            {
              id: "legacy-info",
              properties: {
                "회원 정보": ["legacy"],
                이메일:
                  scenario === "migration-invalid"
                    ? "invalid address@snu.ac.kr"
                    : "synthetic@snu.ac.kr",
              },
            },
          ],
        },
        activities: {
          pages: [
            {
              id: "activity",
              properties: {
                활동명: "Synthetic session",
                일정: { start: "2026-10-01T19:00:00+09:00", end: null },
                "활동 종류": "세미나",
                출석: ["legacy"],
              },
            },
            {
              id: "dinner",
              properties: {
                활동명: "Synthetic dinner",
                일정: { start: "2026-10-01T19:00:00+09:00", end: null },
                "활동 종류": "회식",
                사진: {
                  type: "files",
                  files: [
                    {
                      name: "photo.png",
                      url: "https://synthetic.invalid/photo.png",
                    },
                  ],
                },
              },
            },
          ],
        },
        seminars: {
          pages: [
            {
              id: "seminar",
              properties: {
                제목: "Synthetic seminar",
                학기: "26-2",
                비고: "Recorded note",
                진행자: ["legacy"],
              },
            },
          ],
        },
        "seminar-requests": {
          pages: [
            {
              id: "request",
              properties: { 제목: "Synthetic request", 진행자: ["legacy"] },
            },
          ],
        },
        studies: {
          pages: [
            {
              id: "study",
              properties: {
                분야명: { type: "title" },
                학기: "26-2",
                주최자: ["legacy"],
              },
            },
          ],
        },
        events: {
          pages: [
            {
              id: "event",
              properties: {
                Title: "Synthetic event",
                Date: { start: "2026-10-01T19:00:00+09:00", end: null },
                Type: "세미나",
                NotionPageId: "activity",
                PathId: "path",
                AttendCode: "code",
              },
            },
          ],
        },
      })[name] ?? null,
    requireSupabaseEnv() {},
    resolveDumpDir: () => root,
    saveIdMap() {},
    toDateOnly: (x) => x,
    toDateTime: (x) => x,
    writeJson() {
      effects.push("writeJson");
    },
    OUT_DIR: root,
    supabase: () => {
      effects.push("supabase");
      return {
        from: () => ({
          select: () => ({
            in: async (_, names) => ({
              data: names.flatMap((n) => (db.has(n) ? [db.get(n)] : [])),
              error: null,
            }),
          }),
          upsert: async (rows) => {
            for (const row of rows) db.set(row.name, row);
            return { error: null };
          },
        }),
      };
    },
  };
}
let bodyCalls = 0;
const fetch = async (url) => {
  effects.push(String(url));
  if (scenario.startsWith("smoke")) {
    const u = new URL(url);
    const guest = !u.searchParams.has("dev_preview");
    let status = 200;
    if (["/members/withdrawn", "/archive/seminars/draft"].includes(u.pathname))
      return {
        status: 404,
        text: async () => "Not found",
        headers: { get: () => "text/html" },
      };
    if (u.pathname.startsWith("/api/") && u.pathname !== "/api/version")
      status = 401;
    else if (
      u.pathname.startsWith("/media/") ||
      decodeURIComponent(u.pathname).includes("존재하지")
    )
      status = 404;
    else if (guest && u.pathname.startsWith("/admin")) status = 404;
    else if (
      guest &&
      [
        "/study",
        "/settings/notifications",
        "/seminar/apply",
        "/events/manage",
      ].includes(u.pathname)
    )
      status = 303;
    return {
      status,
      text: async () => "x".repeat(250),
      headers: { get: () => "text/html" },
    };
  }
  let data;
  if (String(url).includes("/databases/") && String(url).endsWith("/query"))
    data = {
      results: [
        {
          id: "page",
          properties: {
            제목: { title: [{ plain_text: "Synthetic" }] },
            학기: { select: { name: "26-2" } },
          },
        },
      ],
      has_more: false,
    };
  else if (String(url).includes("/databases/")) data = { properties: {} };
  else if (scenario === "audit-unknown")
    return { ok: false, status: 403, text: async () => "synthetic denied" };
  else if (scenario === "audit-pages")
    data =
      ++bodyCalls === 1
        ? { results: [], has_more: true, next_cursor: "page2" }
        : {
            results: [
              {
                type: "paragraph",
                paragraph: { rich_text: [{ plain_text: "body" }] },
              },
            ],
            has_more: false,
          };
  else
    data = {
      results: [
        {
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "선수지식: 미적분" }] },
        },
      ],
      has_more: false,
    };
  return { ok: true, json: async () => data };
};
const context = vm.createContext({
  console: Object.fromEntries(
    ["log", "error", "warn", "table"].map((k) => [
      k,
      (...args) =>
        messages.push(
          args
            .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
            .join(" "),
        ),
    ]),
  ),
  process: proc,
  Date,
  Buffer,
  URL,
  URLSearchParams,
  setTimeout: (fn) => {
    fn();
    return 0;
  },
  fetch,
});
const cache = new Map();
const synthetic = (exports) =>
  new vm.SyntheticModule(
    Object.keys(exports),
    function () {
      for (const [k, value] of Object.entries(exports))
        this.setExport(k, value);
    },
    { context },
  );
async function load(file) {
  file =
    [file, `${file}.ts`, path.join(file, "index.ts")].find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    ) ?? file;
  if (cache.has(file)) return cache.get(file);
  let text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".ts"))
    text = ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
  const mod = new vm.SourceTextModule(text, {
    context,
    identifier: file,
    importModuleDynamically: async (spec) => {
      if (!mocks[spec]) throw new Error(`unexpected dynamic import: ${spec}`);
      const imported = synthetic(mocks[spec]);
      await imported.link(() => {
        throw new Error("unexpected synthetic dependency");
      });
      await imported.evaluate();
      return imported;
    },
  });
  cache.set(file, mod);
  return mod;
}
async function linker(spec, referencingModule) {
  const file = referencingModule.identifier;
  if (mocks[spec]) return synthetic(mocks[spec]);
  if (spec === "node:fs") return synthetic(fs);
  if (spec === "node:path") return synthetic({ default: path });
  if (spec.startsWith("$lib/"))
    return load(path.resolve("src/lib", spec.slice(5)));
  if (spec.startsWith(".")) return load(path.resolve(path.dirname(file), spec));
  throw new Error(`unexpected external import: ${spec}`);
}
const scripts = {
  migration: "scripts/migration/20-export-tables.ts",
  "migration-invalid": "scripts/migration/20-export-tables.ts",
  backup: "scripts/ops/ops-backup-db.mjs",
  "clean-read-error": "scripts/ops/ops-verify-clean-names.mjs",
  "body-write-error": "scripts/ops/ops-notion-backfill-body.mjs",
  "rls-bad-key": "scripts/ops/ops-check-rls.mjs",
  "rls-no-control": "scripts/ops/ops-check-rls.mjs",
  "rls-denied": "scripts/ops/ops-check-rls.mjs",
  "audit-pages": "scripts/ops/ops-migration-audit.mjs",
  "audit-unknown": "scripts/ops/ops-migration-audit.mjs",
};
scripts.smoke = "scripts/ops/ops-smoke-all.mjs";
scripts["smoke-hidden"] = scripts.smoke;
proc.argv = [
  "node",
  scripts[scenario],
  ...(scenario === "backup" ? ["--out", root] : []),
];
try {
  const entry = await load(path.resolve(scripts[scenario]));
  await entry.link(linker);
  await entry.evaluate();
  await new Promise((r) => setTimeout(r, 30));
} catch (error) {
  if (error !== stop) throw error;
}
const backup =
  scenario === "backup"
    ? JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            fs.readdirSync(root).find((f) => f.endsWith(".json")),
          ),
          "utf8",
        ),
      )
    : null;
fs.writeFileSync(
  1,
  JSON.stringify({
    status,
    messages,
    effects,
    db: Object.fromEntries(db),
    backup,
  }),
);
