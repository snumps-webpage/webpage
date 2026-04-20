/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Core Notion API client.
 * Handles generic CRUD operations with automatic pagination and property filtering.
 */
import { env } from "$env/dynamic/private";

const NOTION_VERSION = "2022-06-28";

export type NotionProperty = any;

export interface DatabasePropertySchema {
  type: string;
  options?: string[];
}

/**
 * Validates that the required Notion API key is present.
 */
export function validateNotionConfig() {
  if (!env.NOTION_API_KEY) {
    throw new Error(
      ">>> [Notion Client] FATAL: NOTION_API_KEY is missing from environment variables.",
    );
  }
}

/**
 * Returns the required headers for any Notion API request.
 */
export function getHeaders() {
  validateNotionConfig();
  return {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Generic database query with automatic pagination.
 * Supports property filtering via options.filter_properties.
 */
export async function notionQuery(
  databaseId: string,
  options: any = {},
): Promise<any[]> {
  const { filter_properties, ...queryOptions } = options;
  const url = new URL(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
  );

  if (filter_properties && Array.isArray(filter_properties)) {
    filter_properties.forEach((prop: string) =>
      url.searchParams.append("filter_properties", prop),
    );
  }

  console.log(`>>> [Notion Client] notionQuery START [DB: ${databaseId}]`);
  let allResults: any[] = [];
  let hasMore = true;
  let nextCursor: string | undefined = undefined;

  try {
    while (hasMore) {
      const fetchRes = await fetch(url.toString(), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          start_cursor: nextCursor,
          ...queryOptions,
        }),
      });

      const data: any = await fetchRes.json();

      if (!fetchRes.ok) {
        console.error(`>>> [Notion Client] Query Failed:`, data);
        throw new Error(data.message || "Notion API Query Error");
      }

      const fullPages = (data.results || []).filter(
        (page: any) => page && "properties" in page,
      );
      allResults = [...allResults, ...fullPages];

      hasMore = data.has_more;
      nextCursor = data.next_cursor ?? undefined;

      // Limit results if page_size is provided and we have enough
      if (
        queryOptions.page_size &&
        allResults.length >= queryOptions.page_size
      ) {
        allResults = allResults.slice(0, queryOptions.page_size);
        break;
      }
    }
    return allResults;
  } catch (error) {
    console.error(`>>> [Notion Client] Error in notionQuery:`, error);
    throw error;
  }
}

/**
 * Optimized query for when only the first result is needed.
 */
export async function notionQueryFirst(
  databaseId: string,
  options: any = {},
): Promise<any | null> {
  const results = await notionQuery(databaseId, {
    ...options,
    page_size: 1,
  });
  return results.length > 0 ? results[0] : null;
}

export const queryDatabase = notionQuery;

/**
 * Generic page creation.
 */
export async function notionCreate(
  databaseId: string,
  properties: any,
): Promise<any> {
  console.log(`>>> [Notion Client] notionCreate START [DB: ${databaseId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error(`>>> [Notion Client] Create Failed:`, data);
      throw new Error(data.message || "Notion API Create Error");
    }

    return data;
  } catch (error) {
    console.error(`>>> [Notion Client] Error in notionCreate:`, error);
    throw error;
  }
}

/**
 * Generic page update.
 */
export async function notionUpdate(
  pageId: string,
  properties: any,
): Promise<any> {
  console.log(`>>> [Notion Client] notionUpdate START [Page: ${pageId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ properties }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error(`>>> [Notion Client] Update Failed:`, data);
      throw new Error(data.message || "Notion API Update Error");
    }

    return data;
  } catch (error) {
    console.error(`>>> [Notion Client] Error in notionUpdate:`, error);
    throw error;
  }
}

/**
 * Generic page archive (delete).
 */
export async function notionArchive(pageId: string): Promise<void> {
  console.log(`>>> [Notion Client] notionArchive START [Page: ${pageId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ archived: true }),
    });

    if (!response.ok) {
      const data: any = await response.json();
      console.error(`>>> [Notion Client] Archive Failed:`, data);
      throw new Error(data.message || "Notion API Archive Error");
    }
  } catch (error) {
    console.error(`>>> [Notion Client] Error in notionArchive:`, error);
    throw error;
  }
}

/**
 * Generic page retrieval.
 */
export async function notionRetrieve(pageId: string): Promise<any> {
  console.log(`>>> [Notion Client] notionRetrieve START [Page: ${pageId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error(`>>> [Notion Client] Retrieve Failed:`, data);
      throw new Error(data.message || "Notion API Retrieve Error");
    }

    return data;
  } catch (error) {
    console.error(`>>> [Notion Client] Error in notionRetrieve:`, error);
    throw error;
  }
}

/**
 * Generic database retrieval.
 */
export async function notionRetrieveDatabase(databaseId: string): Promise<any> {
  console.log(
    `>>> [Notion Client] notionRetrieveDatabase START [DB: ${databaseId}]`,
  );
  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}`,
      {
        method: "GET",
        headers: getHeaders(),
      },
    );

    const data: any = await response.json();

    if (!response.ok) {
      console.error(`>>> [Notion Client] Retrieve DB Failed:`, data);
      throw new Error(data.message || "Notion API Retrieve DB Error");
    }

    return data;
  } catch (error) {
    console.error(
      `>>> [Notion Client] Error in notionRetrieveDatabase:`,
      error,
    );
    throw error;
  }
}
