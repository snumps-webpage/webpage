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

	console.log('Database ID:', databaseId);
	console.log('Database ID length:', databaseId.length);

	// v5 client의 request가 문제가 있으므로 fetch로 직접 호출
	const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({})
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(JSON.stringify(error));
	}

	const data = await response.json() as QueryDatabaseResponse;
	console.log('Query results count:', data.results.length);
	console.log('First result:', JSON.stringify(data.results[0], null, 2));

	return data.results.filter(
		(page: unknown): page is PageObjectResponse =>
			typeof page === 'object' && page !== null && 'properties' in page
	);
}

export async function getDatabaseSchema(databaseId: string): Promise<Record<string, { type: string }>> {
	const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28'
		}
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(JSON.stringify(error));
	}

	const data = await response.json();
	console.log('Schema response:', JSON.stringify(data, null, 2));

	if (!('properties' in data)) {
		return {};
	}

	const properties = data.properties as Record<string, { type: string }>;
	const result: Record<string, { type: string }> = {};
	for (const [key, value] of Object.entries(properties)) {
		result[key] = { type: value.type };
	}
	console.log('Columns:', result);
	return result;
}
