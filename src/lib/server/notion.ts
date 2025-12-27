import { Client } from '@notionhq/client';
import { env } from '$env/dynamic/private';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

function getNotionClient() {
	return new Client({
		auth: env.NOTION_API_KEY
	});
}

export type NotionProperty = PageObjectResponse['properties'][string];

export function getPropertyValue(property: NotionProperty): string {
	switch (property.type) {
		case 'title':
			return property.title.map((t) => t.plain_text).join('');
		case 'rich_text':
			return property.rich_text.map((t) => t.plain_text).join('');
		case 'number':
			return property.number?.toString() ?? '';
		case 'select':
			return property.select?.name ?? '';
		case 'multi_select':
			return property.multi_select.map((s) => s.name).join(', ');
		case 'date':
			return property.date?.start ?? '';
		case 'checkbox':
			return property.checkbox ? 'Yes' : 'No';
		case 'email':
			return property.email ?? '';
		case 'phone_number':
			return property.phone_number ?? '';
		case 'url':
			return property.url ?? '';
		case 'status':
			return property.status?.name ?? '';
		case 'people':
			return property.people.map((p) => ('name' in p ? p.name : '')).join(', ');
		default:
			return '';
	}
}

interface QueryDatabaseResponse {
	results: unknown[];
	next_cursor: string | null;
	has_more: boolean;
}

export async function queryDatabase(databaseId: string): Promise<PageObjectResponse[]> {
	const notion = getNotionClient();
	// v5: use request method directly for database query
	const response = await notion.request<QueryDatabaseResponse>({
		path: `databases/${databaseId}/query`,
		method: 'post',
		body: {}
	});

	return response.results.filter(
		(page: unknown): page is PageObjectResponse =>
			typeof page === 'object' && page !== null && 'properties' in page
	);
}

export async function getDatabaseSchema(databaseId: string): Promise<Record<string, { type: string }>> {
	const notion = getNotionClient();
	const response = await notion.databases.retrieve({
		database_id: databaseId
	});

	if (!('properties' in response)) {
		return {};
	}

	const properties = response.properties as Record<string, { type: string }>;
	const result: Record<string, { type: string }> = {};
	for (const [key, value] of Object.entries(properties)) {
		result[key] = { type: value.type };
	}
	return result;
}
