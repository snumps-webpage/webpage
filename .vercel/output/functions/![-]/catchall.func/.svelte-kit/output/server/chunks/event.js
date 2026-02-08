const NULL_BODY_STATUS = [101, 103, 204, 205, 304];
const IN_WEBCONTAINER = !!globalThis.process?.versions?.webcontainer;
let sync_store = null;
let als;
import("node:async_hooks").then((hooks) => als = new hooks.AsyncLocalStorage()).catch(() => {
});
function get_request_store() {
  const result = try_get_request_store();
  if (!result) {
    let message = "Could not get the request store.";
    if (als) {
      message += " This is an internal error.";
    } else {
      message += " In environments without `AsyncLocalStorage`, the request store (used by e.g. remote functions) must be accessed synchronously, not after an `await`. If it was accessed synchronously then this is an internal error.";
    }
    throw new Error(message);
  }
  return result;
}
function try_get_request_store() {
  return sync_store ?? als?.getStore() ?? null;
}
function with_request_store(store, fn) {
  try {
    sync_store = store;
    return als ? als.run(store, fn) : fn();
  } finally {
    if (!IN_WEBCONTAINER) {
      sync_store = null;
    }
  }
}
export {
  IN_WEBCONTAINER as I,
  NULL_BODY_STATUS as N,
  get_request_store as g,
  try_get_request_store as t,
  with_request_store as w
};
