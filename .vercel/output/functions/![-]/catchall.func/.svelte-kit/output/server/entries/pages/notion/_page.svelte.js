import { x as attr_class, G as ensure_array_like } from "../../../chunks/index2.js";
import { e as escape_html } from "../../../chunks/escaping.js";
import { a as attr } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let searchQuery = "";
    let searchType = "이름";
    let filteredRows = searchQuery.trim() === "" ? data.rows : data.rows.filter((row) => {
      const value = row[searchType] || "";
      return value.toLowerCase().includes(searchQuery.toLowerCase());
    });
    $$renderer2.push(`<div class="container svelte-u9izya"><h1 class="svelte-u9izya">Notion 데이터베이스</h1> `);
    if (data.error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="error svelte-u9izya">${escape_html(data.error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="search-bar svelte-u9izya"><div class="search-input-wrapper svelte-u9izya"><input type="text"${attr("value", searchQuery)}${attr("placeholder", `${searchType}으로 검색...`)} class="search-input svelte-u9izya"/></div> <div class="toggle-group svelte-u9izya"><button${attr_class("toggle-btn svelte-u9izya", void 0, { "active": searchType === "이름" })}>이름</button> <button${attr_class("toggle-btn svelte-u9izya", void 0, { "active": searchType === "학과" })}>학과</button></div></div> `);
      if (filteredRows.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<p class="empty svelte-u9izya">검색 결과가 없습니다.</p>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="table-wrapper svelte-u9izya"><table class="svelte-u9izya"><thead><tr><!--[-->`);
        const each_array = ensure_array_like(data.columns);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let column = each_array[$$index];
          $$renderer2.push(`<th class="svelte-u9izya">${escape_html(column.name)}</th>`);
        }
        $$renderer2.push(`<!--]--></tr></thead><tbody><!--[-->`);
        const each_array_1 = ensure_array_like(filteredRows);
        for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
          let row = each_array_1[$$index_2];
          $$renderer2.push(`<tr class="svelte-u9izya"><!--[-->`);
          const each_array_2 = ensure_array_like(data.columns);
          for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
            let column = each_array_2[$$index_1];
            $$renderer2.push(`<td class="svelte-u9izya">${escape_html(row[column.name])}</td>`);
          }
          $$renderer2.push(`<!--]--></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
