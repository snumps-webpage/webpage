// Real-browser check of the dashboard buttons: drives system Chromium over the
// DevTools protocol (no Playwright). Run ui-setup.mjs first.
// Usage: node scripts/measure/ui-cdp.mjs [cookie-file]   (BASE, CHROMIUM env optional)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BASE, MEASURE_DIR, setClock } from "./lib.mjs";

const base = BASE;
const cookieFile = process.argv[2] ?? path.join(MEASURE_DIR, "ui-cookie.txt");
const cookie = fs.readFileSync(cookieFile, "utf8").trim();
const port = 9300 + Math.floor(Math.random() * 500);
fs.mkdirSync(MEASURE_DIR, { recursive: true });
const profile = fs.mkdtempSync(path.join(MEASURE_DIR, "cdp-"));
const chrome = spawn(
  process.env.CHROMIUM ?? "chromium",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try {
    const list = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {
    // DevTools endpoint not up yet — retry
  }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === "Runtime.exceptionThrown")
    consoleErrors.push(msg.params.exceptionDetails.text);
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error")
    consoleErrors.push(
      msg.params.args
        .map((a) => a.value ?? a.description)
        .join(" ")
        .slice(0, 200),
    );
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expr) =>
  (
    await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    })
  ).result?.result?.value;

await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCookie", {
  name: "authjs.session-token",
  value: cookie,
  domain: "127.0.0.1",
  path: "/",
});
await send("Page.navigate", { url: `${base}/` });
await sleep(4000); // SSR + hydration

const TITLE = "UI 확인용 세미나";
const rowText = () =>
  evaluate(
    `(() => { const el = [...document.querySelectorAll(".activity-row")].find((n) => n.textContent.includes(${JSON.stringify(TITLE)})); return el ? el.textContent.replace(/\\s+/g, " ").trim() : null; })()`,
  );
const clickInRow = (label) =>
  evaluate(
    `(() => { const el = [...document.querySelectorAll(".activity-row")].find((n) => n.textContent.includes(${JSON.stringify(TITLE)})); const b = el && [...el.querySelectorAll("button")].find((x) => x.textContent.includes(${JSON.stringify(label)})); if (!b) return "no-button:" + (el ? [...el.querySelectorAll("button")].map((x) => x.textContent.trim()).join("|") : "no-row"); b.click(); return "clicked"; })()`,
  );
const notices = () =>
  evaluate(
    `[...document.querySelectorAll('[role=status],[role=alert],.field-error')].map((n) => n.textContent.trim()).filter(Boolean).join(" / ")`,
  );

const out = {};
out.before = await rowText();
out.clickApply = await clickInRow("참여 신청");
await sleep(2500);
out.afterApply = await rowText();
out.noticeApply = await notices();
out.clickCancel = await clickInRow("신청 취소");
await sleep(2500);
out.afterCancel = await rowText();
out.noticeCancel = await notices();

// profile panel: open, bad phone, then a bare 010XXXXXXXX
await evaluate(
  `[...document.querySelectorAll("button")].find((b) => b.textContent.includes("내 정보"))?.click()`,
);
await sleep(500);
const submitPhone = async (value) => {
  await evaluate(
    `(() => { const i = document.querySelector("#dashboard-phone"); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("input", { bubbles: true })); [...document.querySelectorAll("button")].find((b) => b.textContent.includes("정보 저장")).click(); })()`,
  );
  await sleep(2500);
  return {
    notices: await notices(),
    fieldValue: await evaluate(
      `document.querySelector("#dashboard-phone")?.value`,
    ),
  };
};
out.profileBad = await submitPhone("12");
out.profileBare = await submitPhone("01012341234");

// seminar apply: the form starts with the requester (C, 이참가) as presenter
await send("Page.navigate", { url: `${base}/seminar/apply` });
await sleep(4000);
out.applyPresenters = await evaluate(
  `document.querySelector('input[name="speakerIds"]')?.value ?? null`,
);
out.applyPresenterShown = await evaluate(
  `[...document.querySelectorAll(".paper-section")].some((n) => n.textContent.includes("발표자") && n.textContent.includes("이참가"))`,
);
out.consoleErrors = consoleErrors;

console.log(JSON.stringify(out, null, 2));
ws.close();
chrome.kill();
await sleep(500);
fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
await setClock(null); // ui-setup.mjs pinned it
if (
  out.consoleErrors.length ||
  !String(out.afterApply).includes("신청됨") ||
  !out.applyPresenters ||
  !out.applyPresenterShown
)
  process.exitCode = 1;
