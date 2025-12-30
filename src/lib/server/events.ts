import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

const EVENTS_DB_PATH = 'data/events.json';
const ATTENDANCE_QUEUE_PATH = 'data/attendance_queue.json';

export interface Event {
	id: string; // Internal random ID for URL
	notionPageId?: string; // Linked Notion Page ID once activated
	title: string;
	date: string; // ISO String
	type: string;
	status: 'draft' | 'active' | 'expired'; // 'draft' is created but not active/notion-linked yet? Or just internal state. 
    // Prompt says: "activate button creates and activates the page" -> So before activate, it might just be draft.
	pathId: string; // The random path component
}

export interface AttendanceRecord {
	id: string;
	eventId: string;
	userEmail: string;
	userName: string;
	userDept: string;
	startTime: string; // ISO
	endTime?: string; // ISO
	status: 'pending' | 'approved' | 'rejected';
}

async function ensureDir(filePath: string) {
	const dir = path.dirname(filePath);
	try {
		await fs.access(dir);
	} catch {
		await fs.mkdir(dir, { recursive: true });
	}
}

async function readJson<T>(filePath: string): Promise<T[]> {
	try {
		await ensureDir(filePath);
		const data = await fs.readFile(filePath, 'utf-8');
		return JSON.parse(data);
	} catch {
		return [];
	}
}

async function writeJson(filePath: string, data: any) {
	await ensureDir(filePath);
	await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// --- Events ---

export async function getEvents(): Promise<Event[]> {
	return readJson<Event>(EVENTS_DB_PATH);
}

export async function getEvent(id: string): Promise<Event | undefined> {
	const events = await getEvents();
	return events.find(e => e.id === id);
}

export async function getEventByPathId(pathId: string): Promise<Event | undefined> {
	const events = await getEvents();
	return events.find(e => e.pathId === pathId);
}

export async function createEvent(data: { title: string; date: string; type: string }) {
	const events = await getEvents();
	const newEvent: Event = {
		id: crypto.randomUUID(),
		pathId: crypto.randomUUID().slice(0, 8), // Short random path
		title: data.title,
		date: data.date,
		type: data.type,
		status: 'draft'
	};
	events.push(newEvent);
	await writeJson(EVENTS_DB_PATH, events);
	return newEvent;
}

export async function updateEventStatus(id: string, status: Event['status'], notionPageId?: string) {
	const events = await getEvents();
	const event = events.find(e => e.id === id);
	if (event) {
		event.status = status;
		if (notionPageId) event.notionPageId = notionPageId;
		await writeJson(EVENTS_DB_PATH, events);
	}
}

export async function deleteEvent(id: string) {
	let events = await getEvents();
	events = events.filter(e => e.id !== id);
	await writeJson(EVENTS_DB_PATH, events);
}

// --- Attendance ---

export async function getAttendanceQueue(): Promise<AttendanceRecord[]> {
	return readJson<AttendanceRecord>(ATTENDANCE_QUEUE_PATH);
}

export async function recordAttendanceStart(eventId: string, user: { email: string; name: string; dept: string }) {
	const queue = await getAttendanceQueue();
    // Check if already started?
    const existing = queue.find(r => r.eventId === eventId && r.userEmail === user.email);
    if (existing) {
        return { record: existing, isNew: false };
    }

	const newRecord: AttendanceRecord = {
		id: crypto.randomUUID(),
		eventId,
		userEmail: user.email,
		userName: user.name,
		userDept: user.dept,
		startTime: new Date().toISOString(),
		status: 'pending'
	};
	queue.push(newRecord);
	await writeJson(ATTENDANCE_QUEUE_PATH, queue);
	return { record: newRecord, isNew: true };
}

export async function recordAttendanceEnd(eventId: string, email: string) {
	const queue = await getAttendanceQueue();
	const record = queue.find(r => r.eventId === eventId && r.userEmail === email);
	if (record) {
		if (record.endTime) return { record, updated: false };
		record.endTime = new Date().toISOString();
		await writeJson(ATTENDANCE_QUEUE_PATH, queue);
		return { record, updated: true };
	}
	return { record: null, updated: false };
}

export async function updateAttendanceRecord(recordId: string, updates: { startTime?: string; endTime?: string }) {
	const queue = await getAttendanceQueue();
	const record = queue.find(r => r.id === recordId);
	if (record) {
		if (updates.startTime) record.startTime = updates.startTime;
		if (updates.endTime) record.endTime = updates.endTime;
		await writeJson(ATTENDANCE_QUEUE_PATH, queue);
		return record;
	}
	return null;
}

export async function updateAttendanceStatus(recordId: string, status: AttendanceRecord['status']) {
	const queue = await getAttendanceQueue();
	const record = queue.find(r => r.id === recordId);
	if (record) {
		record.status = status;
		await writeJson(ATTENDANCE_QUEUE_PATH, queue);
	}
    // If rejected/approved, maybe remove from queue or keep as history? 
    // Prompt says "admin can accept/reject". Usually implies processing. 
    // Let's keep them but maybe filter in UI. Or remove if processed?
    // Let's keep them for history.
}

export async function removeAttendanceRecord(recordId: string) {
    let queue = await getAttendanceQueue();
    queue = queue.filter(r => r.id !== recordId);
    await writeJson(ATTENDANCE_QUEUE_PATH, queue);
}
