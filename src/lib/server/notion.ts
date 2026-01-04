/**
 * Service for interacting with the Notion API, handling database queries, 
 * schema retrieval, and member/activity updates.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client } from '@notionhq/client';
import { env } from '$env/dynamic/private';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { withCache } from './cache';
import { NOTION_PROPS } from '../constants';

function getNotionClient() {
	return new Client({
		auth: env.NOTION_API_KEY
	});
}

export type NotionProperty = PageObjectResponse['properties'][string];

/**
 * Parses Notion property values into readable strings.
 */
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

/**
 * Recursively queries a Notion database to fetch all records (handling pagination).
 */
export async function queryDatabase(databaseId: string): Promise<PageObjectResponse[]> {
	let allResults: unknown[] = [];
	let hasMore = true;
	let nextCursor: string | null = null;

	while (hasMore) {
		const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${env.NOTION_API_KEY}`,
				'Notion-Version': '2022-06-28',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				start_cursor: nextCursor ?? undefined
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(JSON.stringify(error));
		}

		const data = await response.json() as QueryDatabaseResponse;
		allResults = [...allResults, ...data.results];
		hasMore = data.has_more;
		nextCursor = data.next_cursor;
	}

	return allResults.filter(
		(page: unknown): page is PageObjectResponse =>
			typeof page === 'object' && page !== null && 'properties' in page
	);
}

export interface DatabasePropertySchema {
	type: string;
	options?: string[];
}

/**
 * Retrieves the schema (properties) of a specific Notion database.
 */
export async function getDatabaseSchema(databaseId: string): Promise<Record<string, DatabasePropertySchema>> {
	return withCache(`schema_${databaseId}`, 3600000, async () => {
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

		if (!('properties' in data)) {
			return {};
		}

		const properties = data.properties as Record<string, unknown>;
		const result: Record<string, DatabasePropertySchema> = {};
		for (const [key, value] of Object.entries(properties)) {
			const type = (value as { type: string }).type;
			const options = (value as { [key: string]: { options: { name: string }[] } })[type]?.options?.map((o) => o.name) || undefined;
			result[key] = { type, options };
		}
		return result;
	});
}

/**
 * Creates entries in both Private Info and Member databases and links them.
 */
export async function createMember(data: {
	name: string;
	email: string;
	phone: string;
	department: string;
	background: string;
}) {
	const privateDbId = env.NOTION_DB_PRIVATE_INFO;
	const memberDbId = env.NOTION_DB_MEMBERS;
	
	if (!privateDbId || !memberDbId) throw new Error('DB IDs not set');

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
				[NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
				[NOTION_PROPS.EMAIL]: { email: data.email },
				[NOTION_PROPS.PHONE]: { phone_number: data.phone },
				[NOTION_PROPS.BACKGROUND]: { rich_text: [{ text: { content: data.background } }] }
			}
		})
	});

	if (!privateResponse.ok) {
		throw new Error('Failed to create private info: ' + JSON.stringify(await privateResponse.json()));
	}

	const privatePage = await privateResponse.json() as PageObjectResponse;

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
				[NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
				[NOTION_PROPS.DEPT]: { rich_text: [{ text: { content: data.department } }] },
				[NOTION_PROPS.MEMBER_INFO]: { relation: [{ id: privatePage.id }] },
				[NOTION_PROPS.JOIN_DATE]: { date: { start: new Date().toISOString().split('T')[0] } }
			}
		})
	});

	if (!memberResponse.ok) {
		throw new Error('Failed to create member page: ' + JSON.stringify(await memberResponse.json()));
	}
}

/**
 * Fetches all seminars where the specific member is a speaker.
 */
export async function getUserSeminars(memberId: string) {
	const dbId = env.NOTION_DB_SEMINARS;
	if (!dbId) return [];

	const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			filter: {
				property: NOTION_PROPS.SEMINAR_SPEAKER,
				relation: { contains: memberId }
			},
			sorts: [{ property: NOTION_PROPS.SEMINAR_SEMESTER, direction: 'descending' }]
		})
	});

	if (!response.ok) return [];

	const data = await response.json() as QueryDatabaseResponse;
	return data.results
		.filter((page: unknown): page is PageObjectResponse => 
			typeof page === 'object' && page !== null && 'properties' in page
		)
		.map(page => {
			const props = page.properties;
			const titleProp = props[NOTION_PROPS.SEMINAR_TITLE] as any;
			const remarksProp = props[NOTION_PROPS.SEMINAR_REMARKS] as any;
			const semesterProp = props[NOTION_PROPS.SEMINAR_SEMESTER] as any;

			return {
				id: page.id,
				title: titleProp?.type === 'title' ? titleProp.title[0]?.plain_text ?? '' : '',
				remarks: remarksProp?.type === 'rich_text' ? remarksProp.rich_text[0]?.plain_text ?? '' : '',
				semester: semesterProp?.type === 'select' ? semesterProp.select?.name ?? '' : ''
			};
		});
}

/**
 * Updates a seminar record in Notion.
 */
export async function updateSeminar(pageId: string, data: { title?: string; remarks?: string }) {
	const props: Record<string, any> = {};
	if (data.title !== undefined) props[NOTION_PROPS.SEMINAR_TITLE] = { title: [{ text: { content: data.title } }] };
	if (data.remarks !== undefined) props[NOTION_PROPS.SEMINAR_REMARKS] = { rich_text: [{ text: { content: data.remarks } }] };

	const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
		method: 'PATCH',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ properties: props })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(JSON.stringify(error));
	}
}

/**
 * Resolves a user's Private Info ID and Member ID by searching for their email.
 */
export async function getMemberByEmail(email: string) {
	return withCache(`member_${email}`, 300000, async () => {
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
					property: NOTION_PROPS.EMAIL,
					email: { equals: email }
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
		const relationProp = page.properties[NOTION_PROPS.MEMBER_INFO];
			
		if (relationProp?.type !== 'relation' || relationProp.relation.length === 0) {
			return null;
		}

		return {
			privateInfoId: page.id,
			memberId: relationProp.relation[0].id
		};
	});
}

/**
 * Fetches all members from the database with pagination.
 */
export async function getAllMembers() {
	return withCache('all_members', 60000, async () => {
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
						property: NOTION_PROPS.NAME,
						title: { is_not_empty: true }
					},
					sorts: [{ property: NOTION_PROPS.NAME, direction: 'ascending' }],
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
			const nameProp = props[NOTION_PROPS.NAME] as any;
			const deptProp = props[NOTION_PROPS.DEPT] as any;
			const joinDateProp = props[NOTION_PROPS.JOIN_DATE] as any;

			return {
				id: page.id,
				name: nameProp?.type === 'title' ? nameProp.title[0]?.plain_text ?? '' : '',
				department: deptProp?.type === 'rich_text' ? deptProp.rich_text[0]?.plain_text ?? '' : '',
				joinDate: joinDateProp?.type === 'date' ? joinDateProp.date?.start ?? '' : ''
			};
		});
	});
}

/**
 * Fetches all activities from the database with pagination.
 */
export async function getAllActivities() {
	return withCache('all_activities', 60000, async () => {
		const dbId = env.NOTION_DB_ACTIVITIES;
		if (!dbId) throw new Error('NOTION_DB_ACTIVITIES is not set');

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
					sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: 'descending' }],
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
			const nameProp = props[NOTION_PROPS.ACTIVITY_NAME] as any;
			const dateProp = props[NOTION_PROPS.ACTIVITY_DATE] as any;
			const typeProp = props[NOTION_PROPS.ACTIVITY_TYPE] as any;

			return {
				id: page.id,
				name: nameProp?.type === 'title' ? nameProp.title[0]?.plain_text ?? '' : '',
				date: dateProp?.type === 'date' ? dateProp.date?.start ?? '' : '',
				type: typeProp?.type === 'select' ? typeProp.select?.name ?? '' : '',
				url: (page as any).public_url || page.url
			};
		});
	});
}

/**
 * Searches for the president's name for a given semester prefix (e.g., '25-2').
 */
export async function getPresidentName(semesterPrefix: string): Promise<string> {
	return withCache(`president_${semesterPrefix}`, 3600000, async () => {
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
					property: NOTION_PROPS.EXECUTIVES,
					multi_select: { contains: roleName }
				}
			})
		});

		if (!response.ok) return '';

		const data = await response.json() as QueryDatabaseResponse;
		if (data.results.length === 0) return '';

		const page = data.results[0] as PageObjectResponse;
		const nameProp = page.properties[NOTION_PROPS.NAME] as any;
		if (nameProp?.type === 'title' && nameProp.title.length > 0) {
			return nameProp.title[0].plain_text;
		}
		return '';
	});
}

/**
 * Fetches all activities within a specific date range.
 */
export async function getActivities(startDate: string, endDate: string) {
	return withCache(`activities_${startDate}_${endDate}`, 300000, async () => {
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
						{ property: NOTION_PROPS.ACTIVITY_DATE, date: { on_or_after: startDate } },
						{ property: NOTION_PROPS.ACTIVITY_DATE, date: { on_or_before: endDate } }
					]
				},
				sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: 'descending' }]
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
				const nameProp = props[NOTION_PROPS.ACTIVITY_NAME] as any;
				const dateProp = props[NOTION_PROPS.ACTIVITY_DATE] as any;
				const typeProp = props[NOTION_PROPS.ACTIVITY_TYPE] as any;
				const attendProp = props[NOTION_PROPS.ATTENDANCE] as any;

				return {
					id: page.id,
					name: nameProp?.type === 'title' ? nameProp.title[0]?.plain_text ?? '' : '',
					date: dateProp?.type === 'date' ? dateProp.date?.start ?? '' : '',
					type: typeProp?.type === 'select' ? typeProp.select?.name ?? '' : '',
					attendees: attendProp?.type === 'relation' ? attendProp.relation.map((r: any) => r.id) : [],
					url: (page as any).public_url || page.url
				};
			});
	});
}

/**
 * Fetches all activities participated in by a specific member.
 */
export async function getUserActivities(memberId: string) {
	return withCache(`user_activities_${memberId}`, 300000, async () => {
		const dbId = env.NOTION_DB_ACTIVITIES;
		if (!dbId) throw new Error('NOTION_DB_ACTIVITIES is not set');

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
						property: NOTION_PROPS.ATTENDANCE,
						relation: { contains: memberId }
					},
					sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: 'descending' }],
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
			const nameProp = props[NOTION_PROPS.ACTIVITY_NAME] as any;
			const dateProp = props[NOTION_PROPS.ACTIVITY_DATE] as any;
			const typeProp = props[NOTION_PROPS.ACTIVITY_TYPE] as any;

			return {
				id: page.id,
				name: nameProp?.type === 'title' ? nameProp.title[0]?.plain_text ?? '' : '',
				date: dateProp?.type === 'date' ? dateProp.date?.start ?? '' : '',
				type: typeProp?.type === 'select' ? typeProp.select?.name ?? '' : '',
				url: (page as any).public_url || page.url
			};
		});
	});
}

/**
 * Updates personal information fields in the Private Info database.
 */
export async function updatePrivateInfo(pageId: string, data: { phone?: string; background?: string }) {
	const props: Record<string, any> = {};
	if (data.phone !== undefined) props[NOTION_PROPS.PHONE] = { phone_number: data.phone };
	if (data.background !== undefined) props[NOTION_PROPS.BACKGROUND] = { rich_text: [{ text: { content: data.background } }] };

	const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
		method: 'PATCH',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ properties: props })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(JSON.stringify(error));
	}
}

/**
 * Creates a new activity record in the Notion Activities database.
 */
export async function createActivityPage(data: { title: string; date: string; type: string; attendeeIds?: string[]; timeZone?: string }) {
	const dbId = env.NOTION_DB_ACTIVITIES;
	if (!dbId) throw new Error('NOTION_DB_ACTIVITIES is not set');

	const dateObj: any = { start: data.date };
	if (data.timeZone) {
		dateObj.time_zone = data.timeZone;
	}

	const properties: any = {
		[NOTION_PROPS.ACTIVITY_NAME]: { title: [{ text: { content: data.title } }] },
		[NOTION_PROPS.ACTIVITY_DATE]: { date: dateObj },
		[NOTION_PROPS.ACTIVITY_TYPE]: { select: { name: data.type } }
	};

	if (data.attendeeIds && data.attendeeIds.length > 0) {
		properties[NOTION_PROPS.ATTENDANCE] = {
			relation: data.attendeeIds.map(id => ({ id }))
		};
	}

	const response = await fetch(`https://api.notion.com/v1/pages`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			parent: { database_id: dbId },
			properties
		})
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error('Failed to create activity page: ' + JSON.stringify(error));
	}

	return await response.json() as PageObjectResponse;
}

/**
 * Appends a member to the attendance list of an activity.
 */
export async function addAttendeeToActivity(pageId: string, memberId: string) {
	const notionClient = getNotionClient();
	const page = await notionClient.pages.retrieve({ page_id: pageId }) as PageObjectResponse;
	
	const currentRelations = page.properties[NOTION_PROPS.ATTENDANCE];
	let currentIds: string[] = [];
	
	if (currentRelations?.type === 'relation') {
		currentIds = currentRelations.relation.map(r => r.id);
	}

	if (currentIds.includes(memberId)) return;

	const newIds = [...currentIds, memberId].map(id => ({ id }));

	await notionClient.pages.update({
		page_id: pageId,
		properties: {
			[NOTION_PROPS.ATTENDANCE]: { relation: newIds }
		}
	});
}

/**
 * Retrieves full details from the Private Info database for a specific record.
 */
export async function getPrivateInfo(pageId: string) {
	const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28'
		}
	});

	if (!response.ok) return null;
	const page = await response.json() as PageObjectResponse;
	const props = page.properties;

	const emailProp = props[NOTION_PROPS.EMAIL] as any;
	const nameProp = props[NOTION_PROPS.NAME] as any;
	const phoneProp = props[NOTION_PROPS.PHONE] as any;
	const backProp = props[NOTION_PROPS.BACKGROUND] as any;

	return {
		email: emailProp?.type === 'email' ? emailProp.email : '',
		name: nameProp?.type === 'title' ? nameProp.title[0]?.plain_text : '',
		phone: phoneProp?.type === 'phone_number' ? phoneProp.phone_number : '',
		background: backProp?.type === 'rich_text' ? backProp.rich_text[0]?.plain_text : ''
	};
}

/**
 * Fetches all records from the Private Info database.
 */
export async function getAllPrivateInfo() {
	const dbId = env.NOTION_DB_PRIVATE_INFO;
	if (!dbId) throw new Error('NOTION_DB_PRIVATE_INFO is not set');

	const results = await queryDatabase(dbId);
	
	return results.map(page => {
		const props = page.properties;
		const emailProp = props[NOTION_PROPS.EMAIL] as any;
		const nameProp = props[NOTION_PROPS.NAME] as any;
		const relationProp = props[NOTION_PROPS.MEMBER_INFO] as any;

		return {
			id: page.id,
			name: nameProp?.type === 'title' ? nameProp.title[0]?.plain_text ?? '' : '',
			email: emailProp?.type === 'email' ? emailProp.email ?? '' : '',
			memberId: relationProp?.type === 'relation' ? relationProp.relation[0]?.id : undefined
		};
	});
}

// --- Applications (Signups) ---

export async function getApplicationsFromNotion() {
	const dbId = env.NOTION_DB_APPLICATIONS;
	if (!dbId) return [];

	const results = await queryDatabase(dbId);
	
	return results.map(page => {
		const props = page.properties;
		return {
			id: page.id, // Use Notion ID as the primary ID
			email: (props.Email as any)?.email ?? '',
			name: (props.Name as any)?.title?.[0]?.plain_text ?? '',
			phone: (props.Phone as any)?.phone_number ?? '',
			department: (props.Department as any)?.rich_text?.[0]?.plain_text ?? '',
			background: (props.Background as any)?.rich_text?.[0]?.plain_text ?? '',
			submittedAt: (page as any).created_time
		};
	});
}

export async function createApplicationInNotion(data: {
	email: string;
	name: string;
	phone: string;
	department: string;
	background: string;
}) {
	const dbId = env.NOTION_DB_APPLICATIONS;
	if (!dbId) return null;

	const response = await fetch(`https://api.notion.com/v1/pages`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			parent: { database_id: dbId },
			properties: {
				Name: { title: [{ text: { content: data.name } }] },
				Email: { email: data.email },
				Phone: { phone_number: data.phone },
				Department: { rich_text: [{ text: { content: data.department } }] },
				Background: { rich_text: [{ text: { content: data.background } }] }
			}
		})
	});

	if (!response.ok) {
		console.error('Failed to create application in Notion', await response.json());
		return null;
	}

	const page = await response.json() as PageObjectResponse;
	return page.id;
}

export async function removeApplicationInNotion(id: string) {
	const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
		method: 'PATCH',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ archived: true })
	});
	return response.ok;
}

// --- Attendance Queue ---

export async function getAttendanceQueueFromNotion() {
	const dbId = env.NOTION_DB_ATTENDANCE_QUEUE;
	if (!dbId) return [];

	const results = await queryDatabase(dbId);
	
	return results.map(page => {
		const props = page.properties;
		return {
			id: page.id,
			eventId: (props.EventId as any)?.rich_text?.[0]?.plain_text ?? '',
			userEmail: (props.UserEmail as any)?.email ?? '',
			userName: (props.UserName as any)?.title?.[0]?.plain_text ?? '',
			userDept: (props.UserDept as any)?.rich_text?.[0]?.plain_text ?? '',
			startTime: (props.StartTime as any)?.date?.start ?? '',
			endTime: (props.EndTime as any)?.date?.start ?? undefined,
			status: (props.Status as any)?.select?.name ?? 'pending'
		};
	});
}

export async function createAttendanceRecordInNotion(data: {
	eventId: string;
	userEmail: string;
	userName: string;
	userDept: string;
	startTime: string;
}) {
	const dbId = env.NOTION_DB_ATTENDANCE_QUEUE;
	if (!dbId) return null;

	const response = await fetch(`https://api.notion.com/v1/pages`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			parent: { database_id: dbId },
			properties: {
				UserName: { title: [{ text: { content: data.userName } }] },
				UserEmail: { email: data.userEmail },
				UserDept: { rich_text: [{ text: { content: data.userDept } }] },
				EventId: { rich_text: [{ text: { content: data.eventId } }] },
				StartTime: { date: { start: data.startTime } },
				Status: { select: { name: 'pending' } }
			}
		})
	});

	if (!response.ok) return null;
	const page = await response.json() as PageObjectResponse;
	return page.id;
}

export async function updateAttendanceRecordInNotion(id: string, updates: { 
	endTime?: string; 
	status?: string; 
	startTime?: string 
}) {
	const props: any = {};
	if (updates.endTime) props.EndTime = { date: { start: updates.endTime } };
	if (updates.startTime) props.StartTime = { date: { start: updates.startTime } };
	if (updates.status) props.Status = { select: { name: updates.status } };

	await fetch(`https://api.notion.com/v1/pages/${id}`, {
		method: 'PATCH',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ properties: props })
	});
}

export async function removeAttendanceRecordInNotion(id: string) {
	await fetch(`https://api.notion.com/v1/pages/${id}`, {
		method: 'PATCH',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ archived: true })
	});
}

// --- Seminar Requests ---

export async function getSeminarRequestsFromNotion() {
	const dbId = env.NOTION_DB_SEMINAR_REQUESTS;
	if (!dbId) return [];

	const results = await queryDatabase(dbId);
	
	return results.map(page => {
		const props = page.properties;
		const speakerRelation = (props.Speakers as any)?.relation ?? [];
		return {
			id: page.id,
			title: (props.Title as any)?.title?.[0]?.plain_text ?? '',
			date: (props.Date as any)?.date?.start ?? '',
			applicantEmail: (props.ApplicantEmail as any)?.email ?? '',
			applicantName: (props.ApplicantName as any)?.rich_text?.[0]?.plain_text ?? '',
			speakerIds: speakerRelation.map((r: any) => r.id),
			status: (props.Status as any)?.select?.name ?? 'pending',
			submittedAt: (page as any).created_time
		};
	});
}

export async function createSeminarRequestInNotion(data: {
	title: string;
	date: string;
	applicantEmail: string;
	applicantName: string;
	speakerIds: string[];
	timeZone?: string;
}) {
	const dbId = env.NOTION_DB_SEMINAR_REQUESTS;
	if (!dbId) return null;

	const dateObj: any = { start: data.date };
	if (data.timeZone) {
		dateObj.time_zone = data.timeZone;
	}

	const properties: any = {
		Title: { title: [{ text: { content: data.title } }] },
		Date: { date: dateObj },
		ApplicantEmail: { email: data.applicantEmail },
		ApplicantName: { rich_text: [{ text: { content: data.applicantName } }] },
		Status: { select: { name: 'pending' } }
	};

	if (data.speakerIds.length > 0) {
		properties.Speakers = {
			relation: data.speakerIds.map(id => ({ id }))
		};
	}

	const response = await fetch(`https://api.notion.com/v1/pages`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			parent: { database_id: dbId },
			properties
		})
	});

	if (!response.ok) {
		console.error('Failed to create seminar request in Notion', await response.json());
		return null;
	}

	const page = await response.json() as PageObjectResponse;
	return page.id;
}

export async function updateSeminarRequestStatusInNotion(id: string, status: string) {
	await fetch(`https://api.notion.com/v1/pages/${id}`, {
		method: 'PATCH',
		headers: {
			'Authorization': `Bearer ${env.NOTION_API_KEY}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			properties: {
				Status: { select: { name: status } }
			}
		})
	});
}

/**
 * Checks if a Notion page exists and is accessible.
 */
export async function checkPageExists(pageId: string): Promise<boolean> {
	if (!pageId) return false;

	return withCache(`page_exists_${pageId}`, 10000, async () => {
		const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${env.NOTION_API_KEY}`,
				'Notion-Version': '2022-06-28'
			}
		});
		
		if (response.status === 404) return false;
		
		// If it's archived (deleted in Notion UI), it still exists via API but property 'archived' is true.
		if (response.ok) {
			const page = await response.json() as { archived: boolean };
			return !page.archived;
		}
		
		return false;
	});
}