/**
 * Core service for interacting with the Notion API.
 * Provides generic CRUD operations for databases and pages.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client, isNotionClientError } from '@notionhq/client';
import { env } from '$env/dynamic/private';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { withCache } from './cache';
import { NOTION_PROPS } from '../constants';

console.log('>>> [Notion Service] Module loading start');

export type NotionProperty = PageObjectResponse['properties'][string];

export interface DatabasePropertySchema {
	type: string;
	options?: string[];
}

/**
 * --- GENERIC NOTION HELPERS ---
 */

let _client: Client | null = null;

function getClient(): any {
	if (_client) return _client;

	const apiKey = env.NOTION_API_KEY;
	if (!apiKey) {
		console.log('>>> [Notion Service] CRITICAL ERROR: NOTION_API_KEY is missing from environment');
		throw new Error('NOTION_API_KEY is missing');
	}

	console.log('>>> [Notion Service] Initializing Client...');
	_client = new Client({ auth: apiKey });
	return _client;
}

/**
 * Standardized error handler for Notion API calls.
 */
function handleNotionError(error: unknown, context: string) {
	if (isNotionClientError(error)) {
		console.log(`>>> [Notion Service] API Error during ${context}:`, {
			status: (error as any).status,
			code: error.code,
			message: error.message
		});
	} else {
		console.log(`>>> [Notion Service] Unexpected Error during ${context}:`, error);
	}
}

/**
 * Generic database query with automatic pagination.
 */
export async function notionQuery(databaseId: string, options: any = {}): Promise<any[]> {
	console.log(`>>> [Notion Service] notionQuery START [DB: ${databaseId}]`);
	const notion = getClient();
	let allResults: any[] = [];
	let hasMore = true;
	let nextCursor: string | undefined = undefined;

	try {
		while (hasMore) {
			const response: any = await notion.databases.query({
				database_id: databaseId,
				start_cursor: nextCursor,
				...options
			});

			if (!response || !response.results) {
				console.log('>>> [Notion Service] Malformed response received');
				break;
			}

			const fullPages = response.results.filter((page: any) => page && 'properties' in page);
			allResults = [...allResults, ...fullPages];
			
			hasMore = response.has_more;
			nextCursor = response.next_cursor ?? undefined;
		}
		console.log(`>>> [Notion Service] Query success. Count: ${allResults.length}`);
		return allResults;
	} catch (error) {
		handleNotionError(error, `Query [DB: ${databaseId}]`);
		throw error;
	}
}

export const queryDatabase = notionQuery;

/**
 * Generic page creation.
 */
export async function notionCreate(databaseId: string, properties: any): Promise<any> {
	console.log(`>>> [Notion Service] Creating page in DB: ${databaseId}`);
	const notion = getClient();
	try {
		const response = await notion.pages.create({
			parent: { database_id: databaseId },
			properties
		});
		console.log(`>>> [Notion Service] Create success: ${response.id}`);
		return response;
	} catch (error) {
		handleNotionError(error, `Create [DB: ${databaseId}]`);
		throw error;
	}
}

/**
 * Generic page update.
 */
export async function notionUpdate(pageId: string, properties: any): Promise<any> {
	console.log(`>>> [Notion Service] Updating page: ${pageId}`);
	const notion = getClient();
	try {
		const response = await notion.pages.update({
			page_id: pageId,
			properties
		});
		console.log('>>> [Notion Service] Update success');
		return response;
	} catch (error) {
		handleNotionError(error, `Update [Page: ${pageId}]`);
		throw error;
	}
}

/**
 * Generic page archive (delete).
 */
export async function notionArchive(pageId: string): Promise<void> {
	console.log(`>>> [Notion Service] Archiving page: ${pageId}`);
	const notion = getClient();
	try {
		await notion.pages.update({
			page_id: pageId,
			archived: true
		});
		console.log('>>> [Notion Service] Archive success');
	} catch (error) {
		handleNotionError(error, `Archive [Page: ${pageId}]`);
		throw error;
	}
}

/**
 * Generic page retrieval.
 */
export async function notionRetrieve(pageId: string): Promise<any> {
	console.log(`>>> [Notion Service] Retrieving page: ${pageId}`);
	const notion = getClient();
	try {
		const response = await notion.pages.retrieve({ page_id: pageId });
		console.log('>>> [Notion Service] Retrieve success');
		return response;
	} catch (error) {
		handleNotionError(error, `Retrieve [Page: ${pageId}]`);
		throw error;
	}
}

/**
 * Generic database retrieval.
 */
export async function notionRetrieveDatabase(databaseId: string): Promise<any> {
	console.log(`>>> [Notion Service] Retrieving DB metadata: ${databaseId}`);
	const notion = getClient();
	try {
		const response = await notion.databases.retrieve({ database_id: databaseId });
		console.log('>>> [Notion Service] Retrieve DB success');
		return response;
	} catch (error) {
		handleNotionError(error, `Retrieve DB [DB: ${databaseId}]`);
		throw error;
	}
}

/**
 * --- DATA PARSERS ---
 */

export function getPropertyValue(property: any): any {
	if (!property) return '';
	
	try {
		switch (property.type) {
			case 'title':
				return (property.title || []).map((t: any) => t.plain_text).join('');
			case 'rich_text':
				return (property.rich_text || []).map((t: any) => t.plain_text).join('');
			case 'number':
				return property.number ?? 0;
			case 'select':
				return property.select?.name ?? '';
			case 'multi_select':
				return (property.multi_select || []).map((s: any) => s.name).join(', ');
			case 'date':
				return property.date?.start ?? '';
			case 'checkbox':
				return property.checkbox ?? false;
			case 'email':
				return property.email ?? '';
			case 'phone_number':
				return property.phone_number ?? '';
			case 'url':
				return property.url ?? '';
			case 'status':
				return property.status?.name ?? '';
			case 'relation':
				return (property.relation || []).map((r: any) => r.id);
			default:
				return '';
		}
	} catch (e) {
		console.log('>>> [Notion Service] Parsing Error:', e);
		return '';
	}
}

/**
 * --- BUSINESS LOGIC ---
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
	if (!privateDbId || !memberDbId) throw new Error('DB IDs missing');

	const privatePage = await notionCreate(privateDbId, {
		[NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
		[NOTION_PROPS.EMAIL]: { email: data.email },
		[NOTION_PROPS.PHONE]: { phone_number: data.phone },
		[NOTION_PROPS.BACKGROUND]: { rich_text: [{ text: { content: data.background } }] }
	});

	await notionCreate(memberDbId, {
		[NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
		[NOTION_PROPS.DEPT]: { rich_text: [{ text: { content: data.department } }] },
		[NOTION_PROPS.MEMBER_TO_PRIVATE]: { relation: [{ id: privatePage.id }] },
		[NOTION_PROPS.JOIN_DATE]: { date: { start: new Date().toISOString().split('T')[0] } }
	});
}

export async function getMemberByEmail(email: string) {
	return withCache(`member_${email}`, 300000, async () => {
		const dbId = env.NOTION_DB_PRIVATE_INFO;
		if (!dbId) throw new Error('NOTION_DB_PRIVATE_INFO missing');

		const results = await notionQuery(dbId, {
			filter: { property: NOTION_PROPS.EMAIL, email: { equals: email } }
		});

		if (results.length === 0) return null;

		const page = results[0];
		const relationProp: any = page.properties[NOTION_PROPS.PRIVATE_TO_MEMBER];
		if (!relationProp || relationProp.type !== 'relation' || !relationProp.relation?.length) {
			return null;
		}

		return {
			privateInfoId: page.id,
			memberId: relationProp.relation[0].id
		};
	});
}

export async function getMemberById(memberId: string) {
	const page = await notionRetrieve(memberId);
	return {
		id: page.id,
		name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
		privateInfoId: (page.properties[NOTION_PROPS.MEMBER_TO_PRIVATE] as any)?.relation?.[0]?.id
	};
}

export async function getAllMembers() {
	return withCache('all_members', 60000, async () => {
		const dbId = env.NOTION_DB_MEMBERS;
		if (!dbId) throw new Error('NOTION_DB_MEMBERS missing');

		const results = await notionQuery(dbId, {
			filter: { property: NOTION_PROPS.NAME, title: { is_not_empty: true } },
			sorts: [{ property: NOTION_PROPS.NAME, direction: 'ascending' }]
		});

		return results.map(page => ({
			id: page.id,
			name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
			department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
			joinDate: getPropertyValue(page.properties[NOTION_PROPS.JOIN_DATE])
		}));
	});
}

export async function getActivities(startDate: string, endDate: string) {
	return withCache(`activities_${startDate}_${endDate}`, 300000, async () => {
		const dbId = env.NOTION_DB_ACTIVITIES;
		if (!dbId) throw new Error('NOTION_DB_ACTIVITIES missing');

		const results = await notionQuery(dbId, {
			filter: {
				and: [
					{ property: NOTION_PROPS.ACTIVITY_DATE, date: { on_or_after: startDate } },
					{ property: NOTION_PROPS.ACTIVITY_DATE, date: { on_or_before: endDate } }
				]
			},
			sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: 'descending' }]
		});

		return results.map(page => ({
			id: page.id,
			name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
			date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
			type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
			attendees: getPropertyValue(page.properties[NOTION_PROPS.ATTENDANCE]),
			url: (page as any).public_url || page.url
		}));
	});
}

export async function getAllActivities() {
	return withCache('all_activities', 60000, async () => {
		const dbId = env.NOTION_DB_ACTIVITIES;
		if (!dbId) throw new Error('NOTION_DB_ACTIVITIES missing');

		const results = await notionQuery(dbId, {
			sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: 'descending' }]
		});

		return results.map(page => ({
			id: page.id,
			name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
			date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
			type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
			url: (page as any).public_url || page.url
		}));
	});
}

export async function getUserActivities(memberId: string) {
	return withCache(`user_activities_${memberId}`, 300000, async () => {
		const dbId = env.NOTION_DB_ACTIVITIES;
		if (!dbId) throw new Error('NOTION_DB_ACTIVITIES missing');

		const results = await notionQuery(dbId, {
			filter: { property: NOTION_PROPS.ATTENDANCE, relation: { contains: memberId } },
			sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: 'descending' }]
		});

		return results.map(page => ({
			id: page.id,
			name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
			date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
			type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
			url: (page as any).public_url || page.url
		}));
	});
}

export async function getUserSeminars(memberId: string) {
	const dbId = env.NOTION_DB_SEMINARS;
	if (!dbId) return [];

	const results = await notionQuery(dbId, {
		filter: { property: NOTION_PROPS.SEMINAR_SPEAKER, relation: { contains: memberId } },
		sorts: [{ property: NOTION_PROPS.SEMINAR_SEMESTER, direction: 'descending' }]
	});

	return results.map(page => ({
		id: page.id,
		title: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_TITLE]),
		remarks: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REMARKS]),
		semester: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_SEMESTER])
	}));
}

export async function getApplicationsFromNotion() {
	const dbId = env.NOTION_DB_APPLICATIONS;
	if (!dbId) return [];

	const results = await notionQuery(dbId);

	return results.map(page => ({
		id: page.id,
		email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
		name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
		phone: getPropertyValue(page.properties[NOTION_PROPS.PHONE_APP]),
		department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
		background: getPropertyValue(page.properties[NOTION_PROPS.BACKGROUND]),
		accepted: getPropertyValue(page.properties[NOTION_PROPS.APP_ACCEPTED]),
		submittedAt: (page as any).created_time
	}));
}

export async function markApplicationAsAccepted(id: string) {
	const propertyName = NOTION_PROPS.APP_ACCEPTED.normalize('NFC');
	await notionUpdate(id, { [propertyName]: { checkbox: true } });
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

	const page = await notionCreate(dbId, {
		[NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
		[NOTION_PROPS.EMAIL]: { email: data.email },
		[NOTION_PROPS.PHONE_APP]: { phone_number: data.phone },
		[NOTION_PROPS.DEPT]: { rich_text: [{ text: { content: data.department } }] },
		[NOTION_PROPS.BACKGROUND]: { rich_text: [{ text: { content: data.background } }] }
	});
	return page.id;
}

export async function removeApplicationInNotion(id: string) {
	await notionArchive(id);
}

export async function getSeminarRequestsFromNotion() {
	const dbId = env.NOTION_DB_SEMINAR_REQUESTS;
	if (!dbId) return [];

	const results = await notionQuery(dbId);

	return results.map(page => ({
		id: page.id,
		title: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_TITLE]),
		description: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_DESC]),
		prerequisites: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_PREREQ]),
		duration: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_DURATION]),
		speakerIds: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_SPEAKERS]),
		status: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_APPROVED]) ? 'approved' : 'pending',
		submittedAt: (page as any).created_time
	}));
}

export async function createSeminarRequestInNotion(data: {
	title: string;
	description: string;
	prerequisites: string;
	duration: string;
	speakerIds: string[];
}) {
	const dbId = env.NOTION_DB_SEMINAR_REQUESTS;
	if (!dbId) return null;

	const page = await notionCreate(dbId, {
		[NOTION_PROPS.SEMINAR_REQ_TITLE]: { title: [{ text: { content: data.title } }] },
		[NOTION_PROPS.SEMINAR_REQ_DESC]: { rich_text: [{ text: { content: data.description } }] },
		[NOTION_PROPS.SEMINAR_REQ_PREREQ]: { rich_text: [{ text: { content: data.prerequisites } }] },
		[NOTION_PROPS.SEMINAR_REQ_DURATION]: { rich_text: [{ text: { content: data.duration } }] },
		[NOTION_PROPS.SEMINAR_REQ_SPEAKERS]: { relation: (data.speakerIds || []).map(id => ({ id })) }
	});
	return page.id;
}

export async function updateSeminarRequestStatusInNotion(id: string, status: string) {
	await notionUpdate(id, { [NOTION_PROPS.SEMINAR_REQ_APPROVED]: { checkbox: status === 'approved' } });
}

export const removeSeminarRequestInNotion = notionArchive;

export async function createActivityPage(data: { title: string; date: string; type: string; attendeeIds?: string[]; timeZone?: string }) {
	const dbId = env.NOTION_DB_ACTIVITIES;
	if (!dbId) throw new Error('NOTION_DB_ACTIVITIES missing');

	const dateObj: any = { start: data.date };
	if (data.timeZone) dateObj.time_zone = data.timeZone;

	const properties: any = {
		[NOTION_PROPS.ACTIVITY_NAME]: { title: [{ text: { content: data.title } }] },
		[NOTION_PROPS.ACTIVITY_DATE]: { date: dateObj },
		[NOTION_PROPS.ACTIVITY_TYPE]: { select: { name: data.type } }
	};

	if (data.attendeeIds && data.attendeeIds.length > 0) {
		properties[NOTION_PROPS.ATTENDANCE] = { relation: data.attendeeIds.map(id => ({ id })) };
	}

	return await notionCreate(dbId, properties);
}

export async function updatePrivateInfo(pageId: string, data: { phone?: string; background?: string }) {
	const props: any = {};
	if (data.phone !== undefined) props[NOTION_PROPS.PHONE] = { phone_number: data.phone };
	if (data.background !== undefined) props[NOTION_PROPS.BACKGROUND] = { rich_text: [{ text: { content: data.background } }] };
	await notionUpdate(pageId, props);
}

export async function updateSeminar(pageId: string, data: { title?: string; remarks?: string }) {
	const props: any = {};
	if (data.title !== undefined) props[NOTION_PROPS.SEMINAR_TITLE] = { title: [{ text: { content: data.title } }] };
	if (data.remarks !== undefined) props[NOTION_PROPS.SEMINAR_REMARKS] = { rich_text: [{ text: { content: data.remarks } }] };
	await notionUpdate(pageId, props);
}

export async function getPrivateInfo(pageId: string) {
	const page = await notionRetrieve(pageId);
	return {
		email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
		name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
		phone: getPropertyValue(page.properties[NOTION_PROPS.PHONE]),
		background: getPropertyValue(page.properties[NOTION_PROPS.BACKGROUND])
	};
}

export async function getAllPrivateInfo() {
	const dbId = env.NOTION_DB_PRIVATE_INFO;
	if (!dbId) throw new Error('NOTION_DB_PRIVATE_INFO missing');

	const results = await notionQuery(dbId);
	
	return results.map(page => ({
		id: page.id,
		name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
		email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
		memberId: (page.properties[NOTION_PROPS.PRIVATE_TO_MEMBER] as any)?.relation?.[0]?.id
	}));
}

export async function getPresidentName(semesterPrefix: string): Promise<string> {
	return withCache(`president_${semesterPrefix}`, 3600000, async () => {
		const dbId = env.NOTION_DB_MEMBERS;
		if (!dbId) return '';

		const results = await notionQuery(dbId, {
			filter: { 
				or: [
					{ property: NOTION_PROPS.EXECUTIVES, multi_select: { contains: `${semesterPrefix} 회장` } },
					{ property: NOTION_PROPS.EXECUTIVES, multi_select: { contains: `${semesterPrefix} 회 장` } }
				]
			}
		});

		if (results.length === 0) return '';
		return getPropertyValue(results[0].properties[NOTION_PROPS.NAME]);
	});
}

export async function getDatabaseSchema(databaseId: string): Promise<Record<string, DatabasePropertySchema>> {
	return withCache(`schema_${databaseId}`, 3600000, async () => {
		const response = await notionRetrieveDatabase(databaseId);
		const result: Record<string, DatabasePropertySchema> = {};
		if (response && response.properties) {
			for (const [key, value] of Object.entries(response.properties)) {
				const type = (value as any).type;
				const options = (value as any)[type]?.options?.map((o: any) => o.name);
				result[key] = { type, options };
			}
		}
		return result;
	});
}

export async function addAttendeeToActivity(pageId: string, memberId: string) {
	const page = await notionRetrieve(pageId);
	const currentIds = getPropertyValue(page.properties[NOTION_PROPS.ATTENDANCE]) || [];
	if (currentIds.includes(memberId)) return;
	const newIds = [...currentIds, memberId].map((id: string) => ({ id }));
	await notionUpdate(pageId, { [NOTION_PROPS.ATTENDANCE]: { relation: newIds } });
}

export async function checkPageExists(pageId: string): Promise<boolean> {
	try {
		const page = await notionRetrieve(pageId);
		return !!page && !page.archived;
	} catch {
		return false;
	}
}

/**
 * --- Legacy/Misc fetch-based ones (if any left) ---
 */

export async function getAttendanceQueueFromNotion() {
	const dbId = env.NOTION_DB_ATTENDANCE_QUEUE;
	if (!dbId) return [];
	const results = await notionQuery(dbId);
	return results.map(page => ({
		id: page.id,
		eventId: getPropertyValue(page.properties.EventId),
		userEmail: getPropertyValue(page.properties.UserEmail),
		userName: getPropertyValue(page.properties.UserName),
		userDept: getPropertyValue(page.properties.UserDept),
		startTime: getPropertyValue(page.properties.StartTime),
		endTime: getPropertyValue(page.properties.EndTime),
		status: getPropertyValue(page.properties.Status) || 'pending'
	}));
}

export async function createAttendanceRecordInNotion(data: any) {
	const dbId = env.NOTION_DB_ATTENDANCE_QUEUE;
	if (!dbId) return null;
	const page = await notionCreate(dbId, {
		UserName: { title: [{ text: { content: data.userName } }] },
		UserEmail: { email: data.userEmail },
		UserDept: { rich_text: [{ text: { content: data.userDept } }] },
		EventId: { rich_text: [{ text: { content: data.eventId } }] },
		StartTime: { date: { start: data.startTime } },
		Status: { select: { name: 'pending' } }
	});
	return page.id;
}

export async function updateAttendanceRecordInNotion(id: string, updates: any) {
	const props: any = {};
	if (updates.endTime) props.EndTime = { date: { start: updates.endTime } };
	if (updates.startTime) props.StartTime = { date: { start: updates.startTime } };
	if (updates.status) props.Status = { select: { name: updates.status } };
	await notionUpdate(id, props);
}

export async function removeAttendanceRecordInNotion(id: string) {
	await notionArchive(id);
}