/**
 * One way to read a form field: a missing field and a File both read as "",
 * so schemas see strings and report "required" instead of actions crashing on
 * `null`. Shared by every action that validates with a domain schema.
 */
export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
