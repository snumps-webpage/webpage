/**
 * One way to read a form field: a missing field and a File both read as "",
 * so schemas see strings and report "required" instead of actions crashing on
 * `null`. Shared by every action that validates with a domain schema.
 */
export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The one way to turn a schema failure into per-field form messages: the first
 * message of each top-level field. Issues without a field — and, when
 * `fields` is given, fields the form does not render — go under `_form`, so
 * no message is lost to a field nobody displays.
 */
type IssueSource = {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
};

export function fieldIssues(error: IssueSource): Record<string, string>;
export function fieldIssues<F extends string>(
  error: IssueSource,
  fields: readonly F[],
): Partial<Record<F | "_form", string>>;
export function fieldIssues(
  error: IssueSource,
  fields?: readonly string[],
): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    const head = issue.path[0];
    const field =
      typeof head === "string" && (!fields || fields.includes(head))
        ? head
        : "_form";
    issues[field] ??= issue.message;
  }
  return issues;
}
