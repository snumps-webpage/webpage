// 모든 후보에 같은 방식으로 적용하는 측정(원본·출력 모두 DOMParser로 파싱).
window.metrics = (function () {
  const parse = (h) => new DOMParser().parseFromString(h, "text/html");
  const wsn = (s) => (s || "").replace(/\s+/g, " ").trim();
  const bodyText = (doc) => {
    const c = doc.body.cloneNode(true);
    c.querySelectorAll("style,script").forEach((e) => e.remove());
    return wsn(c.textContent);
  };

  function splitDecls(style) {
    const res = [];
    let cur = "",
      depth = 0,
      q = null;
    for (const ch of style) {
      if (q) {
        cur += ch;
        if (ch === q) q = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        q = ch;
        cur += ch;
        continue;
      }
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === ";" && depth === 0) {
        res.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    res.push(cur);
    return res;
  }
  function norm(d) {
    const i = d.indexOf(":");
    if (i < 0) return null;
    const prop = d.slice(0, i).trim().toLowerCase();
    if (!prop) return null;
    const val = d
      .slice(i + 1)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*!\s*important/, " !important");
    if (!val) return null;
    return [prop, val];
  }
  const tmp = document.createElement("div");
  function canon([prop, val]) {
    tmp.style.cssText = "";
    tmp.style.setProperty(prop, val);
    const c = tmp.style.cssText.toLowerCase().replace(/\s+/g, " ").trim();
    return c || prop + ":" + val;
  }
  function declSets(doc, includeSheets) {
    const strict = new Set(),
      canonical = new Set();
    const add = (style) => {
      for (const d of splitDecls(style)) {
        const n = norm(d);
        if (!n) continue;
        strict.add(n[0] + ":" + n[1]);
        canonical.add(canon(n));
      }
    };
    doc
      .querySelectorAll("[style]")
      .forEach((el) => add(el.getAttribute("style")));
    if (includeSheets) {
      doc.querySelectorAll("style").forEach((s) => {
        const t = s.textContent.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const m of t.matchAll(/\{([^{}]*)\}/g)) add(m[1]);
      });
    }
    return { strict, canonical };
  }
  const ratio = (a, b) =>
    a.size === 0 ? null : [...a].filter((x) => b.has(x)).length / a.size;
  const multiset = (arr) => {
    const m = new Map();
    arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
    return m;
  };
  const msInter = (a, b) => {
    let n = 0;
    for (const [k, v] of a) n += Math.min(v, b.get(k) || 0);
    return n;
  };

  function counts(doc) {
    const imgs = [...doc.querySelectorAll("img")];
    const as = [...doc.querySelectorAll("a[href]")];
    return {
      table: doc.querySelectorAll("table").length,
      tr: doc.querySelectorAll("tr").length,
      td: doc.querySelectorAll("td").length,
      img: imgs.length,
      img_cid: imgs.filter((i) =>
        (i.getAttribute("src") || "").toLowerCase().startsWith("cid:"),
      ).length,
      a_href: as.length,
      style_attr_elems: doc.querySelectorAll("[style]").length,
      style_elems: doc.querySelectorAll("style").length,
      imgSrcs: imgs.map((i) => i.getAttribute("src") || ""),
      hrefs: as.map((a) => a.getAttribute("href")),
    };
  }

  function compare(origHtml, outHtml, mode) {
    const o = parse(origHtml),
      p = parse(outHtml);
    const co = counts(o),
      cp = counts(p);
    const so = declSets(o, false),
      sp = declSets(p, false);
    const sp_any = declSets(p, true);
    const to = bodyText(o),
      tp = bodyText(p);
    let textOk;
    if (mode === "a") textOk = to === tp;
    else
      textOk =
        tp.split("테스트").length > to.split("테스트").length &&
        (tp === wsn("테스트 " + to) || wsn(tp.replace("테스트 ", "")) === to);
    const cidKept = msInter(
      multiset(co.imgSrcs.filter((s) => s.toLowerCase().startsWith("cid:"))),
      multiset(cp.imgSrcs),
    );
    return {
      orig: {
        table: co.table,
        tr: co.tr,
        td: co.td,
        img: co.img,
        img_cid: co.img_cid,
        a_href: co.a_href,
        style_decls: so.strict.size,
        style_attr_elems: co.style_attr_elems,
        text_len: to.length,
      },
      out: {
        table: cp.table,
        tr: cp.tr,
        td: cp.td,
        img: cp.img,
        img_cid: cp.img_cid,
        a_href: cp.a_href,
        style_decls: sp.strict.size,
        style_attr_elems: cp.style_attr_elems,
        style_elems: cp.style_elems,
        text_len: tp.length,
      },
      cid_kept: cidKept,
      href_kept: msInter(multiset(co.hrefs), multiset(cp.hrefs)),
      img_src_kept: msInter(multiset(co.imgSrcs), multiset(cp.imgSrcs)),
      style_strict: ratio(so.strict, sp.strict),
      style_canonical: ratio(so.canonical, sp.canonical),
      style_any_canonical: ratio(so.canonical, sp_any.canonical),
      text_ok: textOk,
      text_ok_nows: (() => {
        const ns = (x) => x.replace(/\s+/g, "");
        if (mode === "a") return ns(to) === ns(tp);
        return (
          tp.split("테스트").length > to.split("테스트").length &&
          (ns(tp) === ns("테스트" + to) ||
            ns(tp.replace("테스트", "")) === ns(to))
        );
      })(),
      typed_present: tp.includes("테스트"),
    };
  }
  return { compare };
})();
