// Client component regressions run in a separate browser-conditioned process so
// server-render tests keep Svelte's server entry point. Only Kit/router and I/O
// are replaced; the components and their domain helpers are compiled from source.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compile, compileModule } from "svelte/compiler";
import ts from "typescript";
import { JSDOM } from "jsdom";

const scenario = process.argv[2];
const output = path.resolve(".tmp/ui-regressions", scenario);
fs.mkdirSync(output, { recursive: true });
const dom = new JSDOM('<div id="host"></div>', {
  url: "https://example.test/events/manage?event=A",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLFormElement",
  "HTMLMediaElement",
  "Element",
  "Node",
  "Comment",
  "Text",
  "Event",
  "CustomEvent",
  "SubmitEvent",
  "FormData",
  "File",
  "MutationObserver",
  "getComputedStyle",
  "location",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
  });

const write = (name, value) => {
  fs.writeFileSync(path.join(output, name), value);
  return `./${name}`;
};
const empty = write(
  "empty.mjs",
  compile("", { generate: "client", filename: "Empty.svelte" }).js.code,
);
const app = write(
  "app.mjs",
  compileModule(
    `
export const page=$state({url:new URL("https://example.test/events/manage?event=A")});
export function goto(url){page.url=new URL(url,page.url);}
export async function invalidateAll(){}
`,
    { generate: "client", filename: "app.svelte.js" },
  ).js.code,
);
const forms = write(
  "forms.mjs",
  `
export function enhance(form,submit){
  form.submitForTest=(args={})=>submit({formData:new FormData(form),formElement:form,cancel(){},...args});
  return {destroy(){}};
}
`,
);
const api = write(
  "api.mjs",
  `
export const uploadAdminFile=(...args)=>globalThis.uploadForTest(...args);
export const fetchAdminQueue=async()=>({items:[],generatedAt:"2026-11-04"});
`,
);
const poller = write(
  "poller.mjs",
  "export const createAdminQueuePoller=()=>({start(){},stop(){}});",
);
const actual = new Set();
const generated = new Map();
function component(file) {
  actual.add(path.resolve(file));
  return moduleFile(path.resolve(file));
}
function moduleFile(file) {
  if (generated.has(file)) return generated.get(file);
  const name = `module-${generated.size}.mjs`;
  generated.set(file, `./${name}`);
  const source = fs.readFileSync(file, "utf8");
  let code = file.endsWith(".svelte")
    ? compile(source, { generate: "client", filename: file, css: "injected" })
        .js.code
    : ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText;
  code = code.replace(
    /(from\s*["'])([^"']+)(["'])/g,
    (match, prefix, spec, suffix) => {
      let replacement;
      if (spec === "$app/forms") replacement = forms;
      else if (spec === "$app/navigation" || spec === "$app/state")
        replacement = app;
      else if (spec === "$lib/client/api") replacement = api;
      else if (spec === "$lib/client/admin-queue-poller") replacement = poller;
      else if (spec.startsWith("$lib/") || spec.startsWith(".")) {
        let target = spec.startsWith("$lib/")
          ? path.resolve("src/lib", spec.slice(5))
          : path.resolve(path.dirname(file), spec);
        if (!path.extname(target)) target += ".ts";
        replacement =
          target.endsWith(".svelte") && !actual.has(target)
            ? empty
            : moduleFile(target);
      }
      return replacement ? prefix + replacement + suffix : match;
    },
  );
  write(name, code);
  return `./${name}`;
}
const { mount, tick, unmount } = await import("svelte");
const settle = async () => {
  await tick();
  await new Promise((resolve) => setImmediate(resolve));
  await tick();
};
async function render(file, props) {
  const mod = await import(new URL(component(file), `file://${output}/`));
  const instance = mount(mod.default, {
    target: document.querySelector("#host"),
    props,
  });
  await settle();
  return () => unmount(instance);
}
function pickFile(input) {
  Object.defineProperty(input, "files", {
    value: [new File(["synthetic"], "poster.png", { type: "image/png" })],
    configurable: true,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
async function posterForm() {
  for (const file of [
    "src/lib/components/poster/PosterUploadField.svelte",
    "src/lib/components/poster/SeminarPosterSection.svelte",
  ])
    actual.add(path.resolve(file));
  await render("src/lib/components/seminar/SeminarRequestForm.svelte", {
    mode: "create",
    members: [],
    timingOptions: [],
  });
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("직접 업로드"))
    .click();
  await settle();
  let finish;
  globalThis.uploadForTest = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  pickFile(document.querySelector("input[type=file]"));
  await settle();
  return async (key) => {
    finish({ s3Key: key });
    await settle();
  };
}

if (scenario === "confirmation") {
  // Exercise the installed enhance implementation: it intentionally ignores
  // event.defaultPrevented and uses the submit callback's cancel() contract.
  const source = fs
    .readFileSync("node_modules/@sveltejs/kit/src/runtime/app/forms.js", "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export \{ applyAction \};\n/m, "")
    .replace(/^export /gm, "");
  globalThis.enhanceForTest = new Function(
    "DEV",
    "BROWSER",
    "noop",
    "invalidateAll",
    "applyAction",
    "devalue",
    "client_app",
    "server_app",
    source + "\nreturn enhance;",
  )(
    false,
    true,
    () => {},
    async () => {},
    async () => {},
    {},
    {},
    {},
  );
  write(
    "forms.mjs",
    "export const enhance=(...args)=>globalThis.enhanceForTest(...args);",
  );
  let posts = 0;
  globalThis.fetch = async () => {
    posts++;
    return { status: 200, text: async () => '{"type":"success","status":200}' };
  };
  globalThis.confirm = () => false;
  await render("src/routes/(applicant)/signup/edit/+page.svelte", {
    data: { application: { id: "synthetic" }, parsedInfo: {}, user: {} },
    form: null,
  });
  const form = document.querySelector(
    'form[action="/wait?/withdrawApplication"]',
  );
  form.dispatchEvent(
    new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: form.querySelector("button"),
    }),
  );
  await settle();
  assert.equal(posts, 0, "rejected confirmation must send no withdrawal POST");
} else if (scenario === "admin-event" || scenario === "admin-attendance") {
  const child =
    scenario === "admin-event" ? "AdminEventLedger" : "AdminAttendanceQueue";
  actual.add(path.resolve(`src/lib/components/admin/${child}.svelte`));
  const event = {
    id: "A",
    activityId: "activity-A",
    title: "Before",
    type: "세미나",
    startsAt: "2026-11-04T12:00:00+09:00",
    endsAt: null,
    status: "draft",
    attendancePath: "/events/A/code",
    pendingAttendanceCount: 1,
    canActivate: true,
    canExpire: false,
    canDelete: false,
  };
  const record = {
    id: "r1",
    eventId: "A",
    activityId: "activity-A",
    eventTitle: "Before",
    startTime: "2026-11-04T10:00:00+09:00",
    endTime: "2026-11-04T11:00:00+09:00",
    status: "pending",
    createdAt: "2026-11-04T10:00:00+09:00",
    canApprove: true,
    canReject: true,
    canEdit: true,
    canDelete: true,
    member: {
      id: "m1",
      name: "Synthetic",
      department: "Math",
      email: "synthetic@example.test",
    },
  };
  const data = {
    generatedAt: "2026-11-04",
    streamed: {
      applications: [],
      events: [event],
      attendanceQueue: [record],
      withdrawnPending: [],
      seminarRequests: [],
      studyRequests: [],
    },
  };
  globalThis.initialUiData = data;
  const page = component("src/routes/(admin)/admin/+page.svelte");
  write(
    "harness.mjs",
    compile(
      `<script>import Page from '${page}'; let data=$state.raw(globalThis.initialUiData); globalThis.replaceUiData=(value)=>data=value;</script><Page {data}/>`,
      { generate: "client", filename: "Harness.svelte" },
    ).js.code,
  );
  const Harness = (await import(`file://${output}/harness.mjs`)).default;
  mount(Harness, { target: document.querySelector("#host") });
  await settle();
  const freshEvent = {
    ...event,
    title: "After",
    status: "active",
    canActivate: false,
    canExpire: true,
  };
  const freshRecord = { ...record, startTime: "2026-11-04T15:00:00+09:00" };
  let callback;
  if (scenario === "admin-event")
    callback = document
      .querySelector('form[action="?/activateEvent"]')
      .submitForTest();
  else {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.trim() === "시간")
      .click();
    await settle();
    callback = document
      .querySelector('form[action="?/updateAttendanceTime"]')
      .submitForTest();
  }
  await callback({
    result: { type: "success", data: {} },
    update: async () => {
      globalThis.replaceUiData({
        ...data,
        streamed: {
          ...data.streamed,
          events: [freshEvent],
          attendanceQueue: [freshRecord],
        },
      });
      await settle();
    },
  });
  await settle();
  if (scenario === "admin-event") {
    assert.equal(
      document.querySelector(".event-cell strong").textContent,
      "After",
      "success must preserve newly loaded event title",
    );
    assert.equal(
      document.querySelector(".status-cell span").textContent,
      "진행",
      "success must preserve newly loaded event status",
    );
  } else
    assert.equal(
      document.querySelector("time").getAttribute("datetime"),
      freshRecord.startTime,
      "success must preserve newly loaded attendance time",
    );
} else if (scenario === "poster-retention") {
  const finish = await posterForm();
  await finish("uploads/pending/retained.png");
  const callback = document.querySelector("form").submitForTest();
  await settle();
  await callback({
    result: {
      type: "failure",
      status: 400,
      data: { issues: { title: "Required" } },
    },
    update: async () => {},
  });
  await settle();
  assert.equal(
    new FormData(document.querySelector("form")).get("posterPendingKey"),
    "uploads/pending/retained.png",
    "validation failure must retain the uploaded poster",
  );
} else if (scenario === "poster-mode-switch") {
  const finish = await posterForm();
  const picker = document.querySelector("input[type=file]");
  const modes = document.querySelectorAll(".mode-toggle button");
  modes[0].click();
  await settle();
  modes[1].click();
  await settle();
  assert.equal(
    document.querySelector("input[type=file]"),
    picker,
    "mode clicks must not detach the uploading poster field",
  );
  await finish("uploads/pending/first.png");
  assert.equal(modes[0].disabled, false, "mode selection resumes after upload");
  pickFile(picker);
  await settle();
  modes[0].click();
  await settle();
  assert.equal(document.querySelector("input[type=file]"), picker);
  assert.equal(document.querySelector("form button.primary").disabled, true);
  await finish("uploads/pending/replacement.png");
  assert.equal(
    new FormData(document.querySelector("form")).get("posterPendingKey"),
    "uploads/pending/replacement.png",
  );
  assert.equal(document.querySelector("form button.primary").disabled, false);
} else if (scenario === "poster-upload") {
  const finish = await posterForm();
  assert.equal(
    document.querySelector('form button[type="submit"], form button.primary')
      .disabled,
    true,
    "request submission must be disabled while poster uploads",
  );
  let cancelled = false;
  document.querySelector("form").submitForTest({
    cancel: () => {
      cancelled = true;
    },
  });
  assert.equal(
    cancelled,
    true,
    "programmatic enhanced submission must also be cancelled during upload",
  );
  await finish("uploads/pending/first.png");
  pickFile(document.querySelector("input[type=file]"));
  await settle();
  assert.equal(
    new FormData(document.querySelector("form")).get("posterPendingKey"),
    "",
    "replacement upload must not submit the preceding poster key",
  );
} else if (scenario === "admin-poster-upload") {
  actual.add(
    path.resolve("src/lib/components/poster/PosterUploadField.svelte"),
  );
  globalThis.uploadForTest = () => new Promise(() => {});
  await render("src/lib/components/admin/AdminSeminarRecordEditor.svelte", {
    records: [],
    members: [],
    currentTerm: "26-2",
  });
  pickFile(document.querySelector("input[type=file]"));
  await settle();
  assert.equal(
    document.querySelector('form[action="?/create"] button[type=submit]')
      .disabled,
    true,
    "admin creation must wait for its poster upload",
  );
} else if (scenario === "attendance-race") {
  const member = (id) => ({
    id,
    name: id,
    department: "Math",
    checked: true,
    checkedInAt: null,
  });
  const event = (id, applicant) => ({
    id,
    title: id,
    date: "2026-11-04T12:00:00+09:00",
    status: "active",
    applicants: [member(applicant)],
    nonApplicantAttendanceCount: 0,
    seminarId: null,
    canCancel: false,
    attendancePath: `/events/${id}/code`,
  });
  await render("src/routes/(member)/events/manage/+page.svelte", {
    data: { managedSeminars: [event("A", "a"), event("B", "b")] },
  });
  const callback = document
    .querySelector('form[action="?/saveAttendance"]')
    .submitForTest();
  const select = document.querySelector("#event-selector");
  select.value = "B";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
  await callback({
    result: {
      type: "success",
      data: {
        operation: "presenterAttendanceSaved",
        eventId: "A",
        applicantAttendeeIds: ["a"],
        totalAttendanceCount: 1,
      },
    },
  });
  await settle();
  const saved = new FormData(document.querySelector("form"));
  assert.equal(saved.get("eventId"), "B");
  assert.deepEqual(
    saved.getAll("attendeeIds"),
    ["b"],
    "A response must not clear B's selected attendance",
  );
} else throw new Error(`Unknown scenario: ${scenario}`);
console.log(`PASS ${scenario}`);
