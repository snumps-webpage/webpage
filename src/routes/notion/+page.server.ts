import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { queryDatabase, getDatabaseSchema, getPropertyValue, type NotionProperty } from '$lib/server/notion';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();

	if (!session?.user) {
		redirect(302, '/login');
	}

	if (!isAdmin(session.user.email)) {
		redirect(302, '/');
	}

	const databaseId = env.NOTION_DB_MEMBERS;

	if (!databaseId) {
		return {
			error: 'NOTION_DB_MEMBERS가 설정되지 않았습니다.',
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
		console.error('Notion API Error:', err);
		const errorDetail = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
		return {
			error: `Notion API 오류: ${errorDetail}`,
			columns: [],
			rows: []
		};
	}
};
