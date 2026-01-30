var is_array = Array.isArray;
var index_of = Array.prototype.indexOf;
var array_from = Array.from;
var define_property = Object.defineProperty;
var get_descriptor = Object.getOwnPropertyDescriptor;
var object_prototype = Object.prototype;
var array_prototype = Array.prototype;
var get_prototype_of = Object.getPrototypeOf;
var is_extensible = Object.isExtensible;
const noop = () => {
};
function is_promise(value) {
  return typeof value?.then === "function";
}
function run_all(arr) {
  for (var i = 0; i < arr.length; i++) {
    arr[i]();
  }
}
function deferred() {
  var resolve;
  var reject;
  var promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
export {
  array_prototype as a,
  get_prototype_of as b,
  is_extensible as c,
  deferred as d,
  index_of as e,
  define_property as f,
  get_descriptor as g,
  array_from as h,
  is_array as i,
  is_promise as j,
  noop as n,
  object_prototype as o,
  run_all as r
};
