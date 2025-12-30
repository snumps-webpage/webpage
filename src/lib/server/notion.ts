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

export async function withdrawMember(pageId: string) {
	const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
		method: 'PATCH',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			properties: {
				'탈퇴 여부': {
					checkbox: true
				}
			}
		})
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(JSON.stringify(error));
	}
}

export async function createMember(data: {
	name: string;
	email: string;
	phone: string;
	department: string;
	bio: string;
	background: string;
}) {
	const privateDbId = env.NOTION_DB_PRIVATE_INFO;
	const memberDbId = env.NOTION_DB_MEMBERS;
	
	if (!privateDbId || !memberDbId) throw new Error('DB IDs not set');

	// 1. Create Private Info Page
	const privateResponse = await fetch(`https://api.notion.com/v1/pages`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			parent: { database_id: privateDbId },
			properties: {
				'이름': {
					title: [{ text: { content: data.name } }]
				},
				'이메일': {
					email: data.email
				},
				'전화번호': {
					phone_number: data.phone
				},
				'자기 소개': {
					rich_text: [{ text: { content: data.bio } }]
				},
				'배경 지식': {
					rich_text: [{ text: { content: data.background } }]
				}
			}
		})
	});

	if (!privateResponse.ok) {
		throw new Error('Failed to create private info: ' + JSON.stringify(await privateResponse.json()));
	}

	const privatePage = await privateResponse.json() as PageObjectResponse;

	// 2. Create Member Page
	// Note: '학과' exists in Member DB based on previous schema check
	const memberResponse = await fetch(`https://api.notion.com/v1/pages`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			parent: { database_id: memberDbId },
			properties: {
				'이름': {
					title: [{ text: { content: data.name } }]
				},
				'학과': {
					rich_text: [{ text: { content: data.department } }]
				},
				'개인 정보': {
					relation: [{ id: privatePage.id }]
				},
				'가입일': {
					date: { start: new Date().toISOString().split('T')[0] }
				}
			}
		})
	});

	if (!memberResponse.ok) {
		// Cleanup private page if member creation fails? 
		// For now, just throw.
		throw new Error('Failed to create member page: ' + JSON.stringify(await memberResponse.json()));
	}
	
	// 3. Link back to Private Info (Notion usually handles dual property if configured, but let's be safe or rely on auto-sync)
	// If it's a dual property, Notion updates the other side automatically.
}

export async function getMemberByEmail(email: string) {
	const dbId = env.NOTION_DB_PRIVATE_INFO;
	if (!dbId) throw new Error('NOTION_DB_PRIVATE_INFO is not set');

	const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			filter: {
				property: '이메일',
				email: {
					equals: email
				}
			}
		})
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(JSON.stringify(error));
	}

	const data = await response.json() as QueryDatabaseResponse;
	if (data.results.length === 0) return null;

	const page = data.results[0] as PageObjectResponse;
	// Get related member ID
	const relationProp = page.properties['회원 정보'];
	if (relationProp?.type !== 'relation' || relationProp.relation.length === 0) {
		return null;
	}

	return {
		privateInfoId: page.id,
		memberId: relationProp.relation[0].id
	};
}

export async function getAllMembers() {
	const dbId = env.NOTION_DB_MEMBERS;
	if (!dbId) throw new Error('NOTION_DB_MEMBERS is not set');

	let allResults: PageObjectResponse[] = [];
	let hasMore = true;
	let nextCursor: string | null = null;

	while (hasMore) {
		const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${env.NOTION_API_KEY}`,
				'Notion-Version': '2022-06-28',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				filter: {
					property: '탈퇴 여부',
					checkbox: {
						equals: false
					}
				},
				sorts: [
					{
						property: '이름',
						direction: 'ascending'
					}
				],
				start_cursor: nextCursor ?? undefined
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(JSON.stringify(error));
		}

		const data = await response.json() as QueryDatabaseResponse;
		
		const pages = data.results.filter((page: unknown): page is PageObjectResponse => 
			typeof page === 'object' && page !== null && 'properties' in page
		);
		
		allResults = [...allResults, ...pages];
		hasMore = data.has_more;
		nextCursor = data.next_cursor;
	}
	
	return allResults.map(page => {
			const props = page.properties;
			return {
				id: page.id,
				name: props['이름']?.type === 'title' ? props['이름'].title[0]?.plain_text ?? '' : '',
				department: props['학과']?.type === 'rich_text' ? props['학과'].rich_text[0]?.plain_text ?? '' : '',
				joinDate: props['가입일']?.type === 'date' ? props['가입일'].date?.start ?? '' : ''
			};
		});
}

export async function getPresidentName(semesterPrefix: string): Promise<string> {
	const dbId = env.NOTION_DB_MEMBERS;
	if (!dbId) return '';

	const roleName = `${semesterPrefix} 회장`;

	const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			filter: {
				property: '임원',
				multi_select: {
					contains: roleName
				}
			}
		})
	});

	if (!response.ok) return '';

	const data = await response.json() as QueryDatabaseResponse;
	if (data.results.length === 0) return '';

	const page = data.results[0] as PageObjectResponse;
	const nameProp = page.properties['이름'];
	if (nameProp?.type === 'title' && nameProp.title.length > 0) {
		return nameProp.title[0].plain_text;
	}

	return '';
}

export async function getActivities(startDate: string, endDate: string) {
	const dbId = env.NOTION_DB_ACTIVITIES;
	if (!dbId) throw new Error('NOTION_DB_ACTIVITIES is not set');

	const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			filter: {
				and: [
					{
						property: '일정',
						date: {
							on_or_after: startDate
						}
					},
					{
						property: '일정',
						date: {
							on_or_before: endDate
						}
					}
				]
			},
			sorts: [
				{
					property: '일정',
					direction: 'descending'
				}
			]
		})
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(JSON.stringify(error));
	}

	const data = await response.json() as QueryDatabaseResponse;
	
	return data.results
		.filter((page: unknown): page is PageObjectResponse => 
			typeof page === 'object' && page !== null && 'properties' in page
		)
		.map(page => {
			const props = page.properties;
			return {
				id: page.id,
				name: props['활동명']?.type === 'title' ? props['활동명'].title[0]?.plain_text ?? '' : '',
				date: props['일정']?.type === 'date' ? props['일정'].date?.start ?? '' : '',
				type: props['활동 종류']?.type === 'select' ? props['활동 종류'].select?.name ?? '' : '',
				attendees: props['출석']?.type === 'relation' ? props['출석'].relation.map(r => r.id) : []
			};
		});
}
