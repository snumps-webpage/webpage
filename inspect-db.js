/**
 * Reusable Notion Database Inspector
 * Works with Node 20.6+ using built-in env support.
 * Usage: node --env-file=.env inspect-db.js <database_id>
 */

const API_KEY = process.env.NOTION_API_KEY;

async function inspectDatabase(databaseId) {
  if (!databaseId) {
    console.error("Error: Please provide a Database ID.");
    console.log("Usage: node --env-file=.env inspect-db.js <database_id>");
    return;
  }

  if (!API_KEY) {
    console.error("Error: NOTION_API_KEY not found in environment.");
    return;
  }

  console.log(`🔍 Inspecting Database: ${databaseId}...
`);

  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ API Error: ${data.message}`);
      return;
    }

    console.log(
      `✅ Database Title: ${data.title?.[0]?.plain_text || "Untitled"}`,
    );
    console.log("--- Properties ---");

    const properties = data.properties;
    const keys = Object.keys(properties).sort();

    keys.forEach((key) => {
      const prop = properties[key];
      let details = `[${prop.type}]`;

      if (prop.type === "select" || prop.type === "multi_select") {
        const options = prop[prop.type].options.map((o) => o.name).join(", ");
        details += ` (Options: ${options})`;
      } else if (prop.type === "relation") {
        details += ` (Target DB: ${prop.relation.database_id})`;
      }

      console.log(`${key.padEnd(20)} ${details}`);
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

const dbId = process.argv[2];
inspectDatabase(dbId);
