import { x as attr_class, z as attr_style, F as stringify } from "./index2.js";
function Skeleton($$renderer, $$props) {
  let {
    width = "100%",
    height = "1rem",
    borderRadius = "4px",
    className = ""
  } = $$props;
  $$renderer.push(`<div${attr_class(`skeleton ${stringify(className)}`, "svelte-x2cdj9")}${attr_style(`width: ${stringify(width)}; height: ${stringify(height)}; border-radius: ${stringify(borderRadius)};`)}></div>`);
}
export {
  Skeleton as S
};
