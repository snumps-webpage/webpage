"""편집기 화면 실측 — 메모리 실측 서버(start.sh)에서 합성 .eml로 편집기 로드 → 고침 → 배경 사진 문단
정렬 → 이동 경고 → 저장 → 미리보기 반영 → 서버 초안(cid 유지·서명 주소 없음) → 다시 미리보기 →
파일 교체 경고 → 발송 전 자동 저장·편집 잠금(시험 발송 — 가짜 Google이라 실제 발송 없음).

  scripts/measure/start.sh                 # 터미널 1
  python3 scripts/measure/editor-ui.py     # 터미널 2 (BASE 기본 http://127.0.0.1:5199)

Playwright는 Python(사용자 site-packages)이라 `python3 -I`로는 돌지 않는다. 실패가 있으면 종료 코드 1.
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:5199")
PROBE = {"x-probe": os.environ.get("MEASURE_PROBE_TOKEN", "probe-token")}
WORK = os.environ.get("MEASURE_DIR") or os.path.join(tempfile.gettempdir(), "snumps-measure")
HERE = os.path.join(WORK, "editor-ui")
os.makedirs(HERE, exist_ok=True)
EML = os.path.join(HERE, "sample.eml")
EML2 = os.path.join(HERE, "sample2.eml")  # 같은 파일을 다시 고르면 change 이벤트가 안 남

# ---- 합성 .eml: 표·인라인 style·cid 사진(본문 img + style 배경)·링크·일반 첨부 ----
PNG = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000d4944415478da63f8cfc0f01f0005000201a1e2f1e60000000049454e44ae426082"
    )
).decode()
HTML = (
    '<table style="border:1px solid #333;width:600px"><tr>'
    '<td style="background:#eef;padding:8px">Table cell A</td>'
    '<td style="color:#a00">Cell B</td></tr></table>'
    '<p style="font-size:14px">Hello members, this is the original body.</p>'
    '<img src="cid:logo1" alt="logo" width="40">'
    '<p><a href="https://example.invalid/info">More info</a></p>'
    '<div style="background-image:url(\'cid:logo1\');height:20px">bg</div>'
)
EML_TEXT = "\r\n".join(
    [
        "Subject: Measure broadcast sample",
        "Message-ID: <t7-sample@example.invalid>",
        "From: Sender <sender@example.invalid>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/mixed; boundary="mx"',
        "",
        "--mx",
        'Content-Type: multipart/related; boundary="rl"',
        "",
        "--rl",
        'Content-Type: text/html; charset="UTF-8"',
        "",
        HTML,
        "--rl",
        "Content-Type: image/png",
        "Content-ID: <logo1>",
        "Content-Disposition: inline",
        "Content-Transfer-Encoding: base64",
        "",
        PNG,
        "--rl--",
        "--mx",
        'Content-Type: text/plain; name="notes.txt"',
        'Content-Disposition: attachment; filename="notes.txt"',
        "Content-Transfer-Encoding: base64",
        "",
        base64.b64encode(b"attachment text").decode(),
        "--mx--",
        "",
    ]
)
for path in (EML, EML2):
    with open(path, "w", encoding="utf-8") as f:
        f.write(EML_TEXT)
COOKIE_FILE = os.path.join(HERE, "cookie.txt")
subprocess.run(
    ["node", os.path.join(os.path.dirname(__file__), "editor-ui-cookie.mjs"), COOKIE_FILE],
    check=True,
)

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def probe_post(payload: dict) -> None:
    req = urllib.request.Request(
        f"{BASE}/api/__probe",
        data=json.dumps(payload).encode(),
        headers={**PROBE, "content-type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(req).read()


def probe_get(query: str) -> bytes | None:
    req = urllib.request.Request(f"{BASE}/api/__probe?{query}", headers=PROBE)
    try:
        return urllib.request.urlopen(req).read()
    except urllib.error.HTTPError:
        return None


uploaded: list[str] = []


def on_upload(route, request):
    # 브라우저가 서명 업로드 주소로 보내는 PUT을 서버 메모리 staging에 그대로 넣음
    path = request.url.split("https://memory.test/upload/", 1)[1].split("?", 1)[0]
    body = request.post_data_buffer or b""
    probe_post(
        {
            "op": "stage",
            "path": path,
            "base64": base64.b64encode(body).decode(),
            "contentType": request.headers.get("content-type", "message/rfc822"),
        }
    )
    uploaded.append(path)
    route.fulfill(status=200, body="")


def on_staged(route, request):
    path = request.url.split("https://memory.test/staged/", 1)[1].split("?", 1)[0]
    data = probe_get(f"kind=staged&key={urllib.parse.quote(path)}")
    if data is None:
        route.fulfill(status=404, body="")
    else:
        route.fulfill(status=200, body=data, headers={"content-type": "image/png"})



cookie = open(COOKIE_FILE).read().strip()
errors: list[str] = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context()
    ctx.add_cookies([{"name": "authjs.session-token", "value": cookie, "url": BASE}])
    ctx.route("https://memory.test/upload/**", on_upload)
    ctx.route("https://memory.test/staged/**", on_staged)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(f"{BASE}/admin/mail/broadcast")
    check("admin page loads", page.get_by_text("1. 파일 선택").is_visible())

    page.locator('input[type="file"]').set_input_files(EML)
    expect(page.get_by_text("2. 미리보기")).to_be_visible(timeout=30000)
    check("upload staged through signed url", len(uploaded) == 1)
    s3_key = uploaded[0] if uploaded else ""

    edit = page.get_by_role("button", name="편집", exact=True)
    expect(edit).to_be_visible()
    edit.click()
    frame_el = page.locator(".editor-host iframe")
    expect(frame_el).to_be_visible(timeout=30000)
    jodit = frame_el.content_frame
    expect(jodit.locator("body")).to_contain_text("original body", timeout=15000)
    check("jodit iframe mode with editable html", True)
    img_ok = jodit.locator("img").first.evaluate("i => i.complete && i.naturalWidth > 0")
    check("editor image loads from signed preview url", img_ok)
    check(
        "editor area has no footer",
        "SNUMPS" not in jodit.locator("body").inner_text(),
    )

    page.wait_for_timeout(600)  # change 리스너 부착(300ms) 뒤
    check("initial load is not dirty", not page.get_by_text("저장하지 않은 변경 있음").is_visible())

    # 본문 한 단어 고침
    jodit.locator("p", has_text="original body").click()
    page.keyboard.press("End")
    page.keyboard.type(" EDITEDWORD")
    expect(page.get_by_text("저장하지 않은 변경 있음")).to_be_visible(timeout=5000)
    check("typing marks dirty", True)

    # 배경 사진 문단 가운데 정렬 — 브라우저가 style을 url(&quot;…&quot;)로 다시 씀 (D-000211)
    jodit.locator("div", has_text="bg").last.click()
    jodit.locator("body").evaluate("b => b.ownerDocument.execCommand('justifyCenter')")
    page.keyboard.type("!")

    # 제목·첨부 빼기
    subj = page.get_by_label("제목")
    subj.fill("Edited measure subject")
    page.get_by_label("빼기 · notes.txt").check()

    # 사이트 안 이동 경고 → 취소하면 머무름
    dialogs: list[str] = []

    def dismiss(d):
        dialogs.append(d.message)
        d.dismiss()

    page.on("dialog", dismiss)
    page.evaluate("() => { const a = document.createElement('a'); a.href = '/admin/mail'; a.id='t7nav'; a.textContent='t7nav'; document.body.prepend(a); }")
    page.locator("#t7nav").click()
    page.wait_for_timeout(800)
    check(
        "in-app navigation warns when dirty",
        any("저장하지 않은 편집" in m for m in dialogs) and "/admin/mail/broadcast" in page.url,
        "; ".join(dialogs),
    )
    page.remove_listener("dialog", dismiss)

    # 저장
    page.get_by_role("button", name="저장", exact=True).click()
    expect(page.get_by_text("저장됨", exact=False).first).to_be_visible(timeout=15000)
    page.wait_for_timeout(1500)
    check("dirty cleared after save", not page.get_by_text("저장하지 않은 변경 있음").is_visible())
    pv = page.frame_locator('iframe[title="미리보기"]').locator("body")
    expect(pv).to_contain_text("EDITEDWORD", timeout=15000)
    check("preview shows the saved edit", True)
    check("preview footer present once", pv.inner_text().count("SNUMPS") >= 1)
    check(
        "removed attachment marked in preview",
        page.get_by_text("notes.txt · 제외", exact=False).count() > 0,
    )

    # 서버 상태: 초안 행·본문 파일
    base = s3_key.rsplit(".", 1)[0]
    rows = json.loads(probe_get("kind=table&key=mail-broadcast-drafts") or b"null")
    row_list = (rows or {}).get("rows", rows) if isinstance(rows, dict) else rows
    drow = next((r for r in (row_list or []) if r.get("s3Key") == s3_key), None)
    check("draft row saved", drow is not None and drow.get("subject") == "Edited measure subject")
    check("draft row removedAttachments", drow is not None and drow.get("removedAttachments") == [1], str(drow and drow.get("removedAttachments")))
    dhtml = (probe_get(f"kind=staged&key={urllib.parse.quote(base + '/draft.html')}") or b"").decode()
    check("draft html has the edit", "EDITEDWORD" in dhtml)
    check("draft html keeps cid, no signed url", "cid:logo1" in dhtml and "memory.test" not in dhtml)
    check("draft html keeps table and style", "<table" in dhtml and "background" in dhtml)
    check("aligned bg keeps cid and text-align (D-000211)", "cid:logo1" in dhtml[dhtml.find("background-image"):dhtml.find("background-image")+120] and "text-align" in dhtml[dhtml.find("background-image")-40:dhtml.find("background-image")+120], dhtml[dhtml.find("background-image")-40:dhtml.find("background-image")+120])
    check("style background restored to cid (D-000207)", "url('cid:logo1')" in dhtml or "url(cid:logo1)" in dhtml or "url(\"cid:logo1\")" in dhtml or "url(&quot;cid:logo1&quot;)" in dhtml, dhtml[dhtml.find("background-image"):dhtml.find("background-image")+60])

    # 새로고침 → 주소의 key로 같은 업로드·초안을 다시 엶 (D-000218)
    check("url keeps ?key= after upload", s3_key in urllib.parse.unquote(page.url), page.url)
    page.reload()
    page.locator('input[type="file"]').wait_for()
    check("url keeps ?key= after reload", s3_key in urllib.parse.unquote(page.url), page.url)
    expect(page.get_by_text("2. 미리보기")).to_be_visible(timeout=30000)
    expect(page.get_by_text("저장된 초안 있음", exact=False)).to_be_visible(timeout=15000)
    check("preview opens by itself with the saved draft after reload", True)
    page.get_by_role("button", name="편집", exact=True).click()
    jodit_r = page.locator(".editor-host iframe").content_frame
    expect(jodit_r.locator("body")).to_contain_text("EDITEDWORD", timeout=15000)
    check("edit after reload opens the draft body", True)

    # 같은 파일 재업로드는 새 메일(초안 없음)로 열림 (D-000192)
    page.locator('input[type="file"]').set_input_files(EML)
    expect(page.get_by_text("2. 미리보기")).to_be_visible(timeout=30000)
    page.wait_for_timeout(1500)
    check("same file re-upload opens as a new mail (no draft)", page.get_by_text("저장된 초안 있음", exact=False).count() == 0)
    check("re-upload replaces ?key=", s3_key not in urllib.parse.unquote(page.url) and "key=" in page.url, page.url)

    # 파일 교체 경고: (방금 새로 연 메일을) 편집 → 고침 → 다른 파일 선택 → 취소하면 그대로
    page.get_by_role("button", name="편집", exact=True).click()
    jodit = page.locator(".editor-host iframe").content_frame
    expect(jodit.locator("body")).to_contain_text("original body", timeout=15000)
    page.wait_for_timeout(600)
    jodit.locator("p", has_text="original body").click()
    page.keyboard.press("End")
    page.keyboard.type(" SECONDEDIT")
    expect(page.get_by_text("저장하지 않은 변경 있음")).to_be_visible(timeout=5000)
    dialogs.clear()
    page.on("dialog", dismiss)
    n_up = len(uploaded)
    page.locator('input[type="file"]').set_input_files(EML2)
    page.wait_for_timeout(1000)
    check(
        "file swap warns when dirty, cancel keeps editor",
        any("다른 파일" in m for m in dialogs)
        and len(uploaded) == n_up
        and page.locator(".editor-host iframe").count() == 1,
        "; ".join(dialogs),
    )
    page.remove_listener("dialog", dismiss)

    # 발송 전 자동 저장: [내게 시험 발송] (가짜 Google — 발송은 실패해야 정상)
    s3_key2 = uploaded[-1]

    def slow_save(route, request):
        page.wait_for_timeout(2000)
        route.continue_()

    page.route("**/admin/mail/broadcast?/saveDraft", slow_save)
    page.get_by_role("button", name="내게 시험 발송").click()
    page.wait_for_timeout(700)
    locked = page.get_by_label("제목").is_disabled()
    page.wait_for_timeout(6000)
    check("editor locked during auto-save + send", locked)
    check("lock released after send result", not page.get_by_label("제목").is_disabled())
    base2 = s3_key2.rsplit(".", 1)[0]
    dhtml2 = (probe_get(f"kind=staged&key={urllib.parse.quote(base2 + '/draft.html')}") or b"").decode()
    check("auto-save before test send stored the edit", "SECONDEDIT" in dhtml2)

    page.screenshot(path=os.path.join(HERE, "editor-ui.png"), full_page=True)
    b.close()

relevant = [e for e in errors if "memory.test" not in e]
check("no console errors", not relevant, " | ".join(relevant)[:500])
failed = [n for n, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
