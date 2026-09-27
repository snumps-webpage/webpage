/**
 * A lookup table keyed by strings that come from requests or stored rows.
 *
 * On a plain object literal, `key in table` and `table[key]` also see the
 * prototype: "constructor", "toString", "__proto__" passed as template keys,
 * event names and upload purposes, and turned into 500s with raw TypeErrors
 * or stored bogus rows (audit LB23-4, LB32-1). A table without a prototype
 * answers only for its own keys.
 */
export function lookupTable<T extends object>(entries: T): T {
  return Object.assign(Object.create(null) as T, entries);
}
