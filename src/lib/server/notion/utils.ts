/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Utility functions for parsing Notion API responses.
 */

/**
 * Extracts a simplified value from a Notion property object.
 */
export function getPropertyValue(property: any): any {
  if (!property) return "";

  try {
    switch (property.type) {
      case "title":
        return (property.title || []).map((t: any) => t.plain_text).join("");
      case "rich_text":
        return (property.rich_text || [])
          .map((t: any) => t.plain_text)
          .join("");
      case "number":
        return property.number ?? 0;
      case "select":
        return property.select?.name ?? "";
      case "multi_select":
        return (property.multi_select || []).map((s: any) => s.name).join(", ");
      case "date":
        return property.date?.start ?? "";
      case "checkbox":
        return property.checkbox ?? false;
      case "email":
        return property.email ?? "";
      case "phone_number":
        return property.phone_number ?? "";
      case "url":
        return property.url ?? "";
      case "status":
        return property.status?.name ?? "";
      case "relation":
        return (property.relation || []).map((r: any) => r.id);
      case "people":
        return (property.people || []).map((p: any) => p.name || p.id);
      case "files":
        return (property.files || []).map(
          (f: any) => f.file?.url || f.external?.url || "",
        );
      default:
        return "";
    }
  } catch (e) {
    console.warn(">>> [Notion Utils] Parsing Error:", e);
    return "";
  }
}
