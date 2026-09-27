/**
 * One plain address — no whitespace, separators, brackets or double quotes.
 * An apostrophe is allowed: the stored-email rule accepts it and it cannot
 * add a header or a recipient.
 */
const SINGLE_ADDRESS =
  /^[^\s@,;:<>()"\\[\]]+@[^\s@,;:<>()"'\\[\]]+\.[^\s@,;:<>()"'\\[\]]+$/;

export const isSingleAddress = (value: string) => SINGLE_ADDRESS.test(value);
