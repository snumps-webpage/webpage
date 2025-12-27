import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { queryDatabase, getDatabaseSchema, getPropertyValue, type NotionProperty } from '$lib/server/notion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();

	if (!session?.user) {
		redirect(302, '/login');
	}

	const databaseId = env.NOTION_DATABASE_ID;

	if (!databaseId) {
		return {
			error: 'NOTION_DATABASE_ID가 설정되지 않았습니다.',
			columns: [],
			rows: []
		};
	}

	try {
		const [schema, pages] = await Promise.all([
			getDatabaseSchema(databaseId),
			queryDatabase(databaseId)
		]);

		const columns = Object.entries(schema).map(([name, prop]) => ({
			name,
			type: prop.type
		}));

		const rows = pages.map((page) => {
			const row: Record<string, string> = {};
			for (const [name, prop] of Object.entries(page.properties)) {
				row[name] = getPropertyValue(prop as NotionProperty);
			}
			return { id: page.id, ...row };
		});

		return {
			columns,
			rows,
			error: null
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : '알 수 없는 오류';
		return {
			error: `Notion API 오류: ${message}`,
			columns: [],
			rows: []
		};
	}
};
