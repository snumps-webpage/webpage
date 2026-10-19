"""Jodit(iframe 모드) 보존 시험. 직접 실행하지 말고 editor-preservation.mjs로 부른다.
fixture(또는 --html 파일)마다 (a) 무편집 (b) 한 단어 편집 결과를 원본과 비교한다.
기준: 표·행·칸 수 동일, img src 보존 100%, a href 보존 100%, 정규화 style 보존 >= 99%,
      (a) 화면 픽셀 차이 <= 1%. (b)는 단어가 줄바꿈을 옮겨 픽셀 차이가 정의상 생기므로 참고값.
"""
import argparse, io, json, sys
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--root", required=True)
ap.add_argument("--html", action="append", default=[])
ap.add_argument("--jodit-config", default="{}")
args = ap.parse_args()

ROOT = Path(args.root)
HERE = ROOT / "scripts" / "measure"
JODIT = ROOT / "node_modules" / "jodit" / "es2021"
THRESH = 16  # 한 픽셀의 RGB 채널 최대 절대차가 이 값을 넘으면 '다름'
VIEW_W = 800
STYLE_MIN, PIX_MAX = 0.99, 0.01

try:
    extra_cfg = json.loads(args.jodit_config)
except ValueError as e:
    sys.exit(f"--jodit-config JSON 오류: {e}")
if not isinstance(extra_cfg, dict):
    sys.exit("--jodit-config는 JSON 객체여야 한다")
for p in (JODIT / "jodit.min.js", JODIT / "jodit.min.css"):
    if not p.exists():
        sys.exit(f"없음: {p} (pnpm install 필요)")

inputs = []
for f in sorted((HERE / "editor-fixtures").glob("*.html")):
    inputs.append((f.stem, f.read_text()))
for h in args.html:
    p = Path(h)
    if not p.is_file():
        sys.exit(f"--html 파일 없음: {h}")
    inputs.append((f"html:{p.stem}", p.read_text()))
if not inputs:
    sys.exit("fixture 없음")

HARNESS = """<!doctype html><meta charset="utf-8"><body><div id="host"></div></body>"""
INIT = """async ([html, cfg]) => {
  const ta = document.createElement('textarea');
  document.getElementById('host').appendChild(ta);
  window.ed = Jodit.make(ta, Object.assign({ width: 800, height: 600, iframe: true }, cfg));
  if (window.ed.waitForReady) await window.ed.waitForReady();
  window.ed.value = html;
  await new Promise(r => setTimeout(r, 300));
  return { iframe: !!window.ed.o.iframe && window.ed.editorDocument !== document, version: Jodit.version || null };
}"""
CARET = """() => {
  const ed = window.ed, doc = ed.editorDocument, root = ed.editor;
  const w = doc.defaultView;
  const tw = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n, found = null;
  while ((n = tw.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    if (n.parentElement && n.parentElement.closest('style,script')) continue;
    found = n; break;
  }
  if (root.focus) root.focus();
  w.focus();
  const r = doc.createRange();
  if (found) r.setStart(found, found.nodeValue.length - found.nodeValue.trimStart().length);
  else r.setStart(root, 0);
  r.collapse(true);
  const s = w.getSelection();
  s.removeAllRanges(); s.addRange(r);
  return !!found;
}"""
RENDER = """async (html) => {
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-same-origin');
  f.style.cssText = 'width:800px;height:100px;border:0;display:block';
  f.srcdoc = '<!doctype html><meta charset="utf-8">' + html;
  const loaded = new Promise(r => f.onload = r);
  document.body.style.margin = '0';
  document.body.appendChild(f);
  await loaded;
  await new Promise(r => setTimeout(r, 300));
  const d = f.contentDocument;
  f.style.height = Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0) + 'px';
}"""


def route_block(route):
    u = route.request.url
    if u.startswith(("data:", "blob:", "about:")):
        route.continue_()
    else:
        route.abort()  # 외부 요청 차단(cid:·example.invalid 포함)


def render(br, html):
    ctx = br.new_context(viewport={"width": VIEW_W + 40, "height": 800})
    ctx.route("**/*", route_block)
    pg = ctx.new_page()
    pg.set_content(HARNESS)
    pg.evaluate(RENDER, html)
    png = pg.locator("iframe").screenshot()
    ctx.close()
    return png


def pixdiff(pa, pb):
    a = Image.open(io.BytesIO(pa)).convert("RGB")
    b = Image.open(io.BytesIO(pb)).convert("RGB")
    W, H = max(a.width, b.width), max(a.height, b.height)

    def pad(im):
        c = Image.new("RGB", (W, H), (255, 255, 255))
        c.paste(im, (0, 0))
        return np.asarray(c).astype(int)

    d = np.abs(pad(a) - pad(b)).max(axis=2)
    return float((d > THRESH).sum() / (W * H))


def pct(x):
    return "-" if x is None else f"{x * 100:.1f}%"


rows, failures = [], []
info = {"version": None, "iframe": None}
with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    mctx = br.new_context()
    mpg = mctx.new_page()
    mpg.set_content(HARNESS)
    mpg.add_script_tag(path=str(HERE / "editor-preservation-metrics.js"))

    for name, html in inputs:
        opng = render(br, html)
        for mode in ("a", "b"):
            ctx = br.new_context(viewport={"width": 1000, "height": 900})
            ctx.route("**/*", route_block)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            pg.set_content(HARNESS)
            pg.add_style_tag(path=str(JODIT / "jodit.min.css"))
            pg.add_script_tag(path=str(JODIT / "jodit.min.js"))
            info = pg.evaluate(INIT, [html, extra_cfg])
            if not info["iframe"]:
                failures.append(f"{name}/{mode}: iframe 모드가 아님")
            if mode == "b":
                if not pg.evaluate(CARET):
                    failures.append(f"{name}/b: 캐럿을 둘 글자가 없음")
                pg.keyboard.type("테스트 ")
                pg.wait_for_timeout(400)
            out = pg.evaluate("() => window.ed.value")
            ctx.close()
            m = mpg.evaluate("([o, p, m]) => window.metrics.compare(o, p, m)", [html, out, mode])
            pix = pixdiff(opng, render(br, out))
            o, p = m["orig"], m["out"]
            struct = (o["table"], o["tr"], o["td"]) == (p["table"], p["tr"], p["td"])
            img_ok = m["img_src_kept"] == o["img"]
            href_ok = m["href_kept"] == o["a_href"]
            sty = m["style_canonical"]
            sty_ok = sty is None or sty >= STYLE_MIN
            pix_ok = pix <= PIX_MAX if mode == "a" else True
            text_ok = m["text_ok"]
            ok = struct and img_ok and href_ok and sty_ok and pix_ok and text_ok and not errs
            if not ok:
                checks = [("표·칸", struct), ("img src", img_ok), ("a href", href_ok), ("style", sty_ok),
                          ("화면", pix_ok), ("텍스트", text_ok), ("페이지 오류", not errs)]
                failures.append(f"{name}/{mode}: 미달 {', '.join(k for k, v in checks if not v)}")
            rows.append((name, mode, f"{p['table']}/{p['tr']}/{p['td']} ({o['table']}/{o['tr']}/{o['td']})",
                         f"{m['img_src_kept']}/{o['img']}", f"{m['href_kept']}/{o['a_href']}",
                         pct(sty), pct(pix) + ("" if mode == "a" else " (참고)"), "O" if text_ok else "X",
                         "통과" if ok else "미달"))
    br.close()

hdr = ("입력", "모드", "표/행/칸 (원본)", "img src", "a href", "style", "화면 차이", "텍스트", "판정")
w = [max(len(str(r[i])) for r in rows + [hdr]) for i in range(len(hdr))]
for r in [hdr] + rows:
    print("  ".join(str(c).ljust(w[i]) for i, c in enumerate(r)))
print(f"\nJodit {info['version']}, iframe: {info['iframe']}, 추가 설정: {json.dumps(extra_cfg, ensure_ascii=False)}")
if failures:
    print("\n기준 미달:")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("\n기준 통과")
