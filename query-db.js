/**
 * Reusable Notion Database Querier
 * Retrieves all data rows from a specified database.
 * Usage: node --env-file=.env.safe query-db.js <database_id>
 */

const API_KEY = process.env.NOTION_API_KEY;

async function queryDatabase(databaseId) {
  if (!databaseId) {
    console.error("Error: Please provide a Database ID.");
    console.log("Usage: node --env-file=.env.safe query-db.js <database_id>");
    return;
  }

  if (!API_KEY) {
    console.error("Error: NOTION_API_KEY not found in environment.");
    return;
  }

  console.log(`📡 Querying Database: ${databaseId}...
`);

  let allResults = [];
  let hasMore = true;
  let nextCursor = null;

  try {
    while (hasMore) {
      const response = await fetch(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start_cursor: nextCursor ?? undefined,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(`❌ API Error: ${data.message}`);
        return;
      }

      allResults = [...allResults, ...data.results];
      hasMore = data.has_more;
      nextCursor = data.next_cursor;

      if (hasMore) process.stdout.write("."); // Progress indicator
    }

    console.log(`
✅ Successfully retrieved ${allResults.length} records.
`);

    // Simplify and print data
    const simplified = allResults.map((page) => {
      const row = { id: page.id };
      for (const [key, value] of Object.entries(page.properties)) {
        row[key] = getPropertyValue(value);
      }
      return row;
    });

    console.log(JSON.stringify(simplified, null, 2));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

/**
 * Basic parser for Notion properties (matches logic in src/lib/server/notion.ts)
 */
function getPropertyValue(property) {
  switch (property.type) {
    case "title":
      return property.title.map((t) => t.plain_text).join("");
    case "rich_text":
      return property.rich_text.map((t) => t.plain_text).join("");
    case "number":
      return property.number ?? "";
    case "select":
      return property.select?.name ?? "";
    case "multi_select":
      return property.multi_select.map((s) => s.name).join(", ");
    case "date":
      return property.date?.start ?? "";
    case "checkbox":
      return property.checkbox;
    case "email":
      return property.email ?? "";
    case "phone_number":
      return property.phone_number ?? "";
    case "url":
      return property.url ?? "";
    case "relation":
      return property.relation.map((r) => r.id).join(", ");
    case "status":
      return property.status?.name ?? "";
    default:
      return `[${property.type}]`;
  }
}

const dbId = process.argv[2];
queryDatabase(dbId);
