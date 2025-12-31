/**
 * Service for managing club events and temporary attendance records stored in local JSON.
 */
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { 
	getAttendanceQueueFromNotion, 
	createAttendanceRecordInNotion, 
	updateAttendanceRecordInNotion, 
	removeAttendanceRecordInNotion 
} from './notion';

const EVENTS_DB_PATH = 'data/events.json';
const ATTENDANCE_QUEUE_PATH = 'data/attendance_queue.json';

export interface Event {
	id: string;
	notionPageId?: string;
	title: string;
	date: string;
	type: string;
	status: 'draft' | 'active' | 'expired';
	pathId: string;
    attendCode: string;
}

export interface AttendanceRecord {
	id: string; // Internal/Local ID (often matches Notion ID if synced)
    notionId?: string;
	eventId: string;
	userEmail: string;
	userName: string;
	userDept: string;
	startTime: string;
	endTime?: string;
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

// ... Event functions (unchanged) ...
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

export async function createEvent(data: { title: string; date: string; type: string; notionPageId?: string }) {
	const events = await getEvents();
	const newEvent: Event = {
		id: crypto.randomUUID(),
		pathId: crypto.randomUUID().slice(0, 8),
        attendCode: crypto.randomUUID().slice(0, 12),
		title: data.title,
		date: data.date,
		type: data.type,
		status: 'draft',
		notionPageId: data.notionPageId
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

// --- Attendance Queue with Hybrid Storage ---

export async function getAttendanceQueue(): Promise<AttendanceRecord[]> {
	try {
        const queue = await readJson<AttendanceRecord>(ATTENDANCE_QUEUE_PATH);
        
        // Simplified Sync: If queue empty, try Notion
        if (queue.length === 0) {
            console.log('Local attendance queue empty, checking Notion...');
            try {
                const notionQueue = await getAttendanceQueueFromNotion();
                if (notionQueue.length > 0) {
                    // map notion structure to local if needed, currently they match roughly
                    const mapped = notionQueue.map(r => ({
                        ...r,
                        notionId: r.id
                    })) as AttendanceRecord[];
                    
                    await writeJson(ATTENDANCE_QUEUE_PATH, mapped);
                    return mapped;
                }
            } catch (e) {
                console.error('Failed to sync attendance from Notion:', e);
            }
        }
        return queue;
    } catch (e) {
        // Fallback to Notion completely if FS fails
        console.warn('FS read failed, fetching from Notion', e);
        try {
            const results = await getAttendanceQueueFromNotion();
            return results.map(r => ({ ...r, notionId: r.id })) as AttendanceRecord[];
        } catch {
            return [];
        }
    }
}

/**
 * Records a complete attendance in one go (Start & End time set to now).
 */
export async function recordAttendance(eventId: string, user: { email: string; name: string; dept: string }) {
	const queue = await getAttendanceQueue();
    const existing = queue.find(r => r.eventId === eventId && r.userEmail === user.email);
    if (existing) {
        return { record: existing, isNew: false };
    }

    const now = new Date().toISOString();

    // 1. Notion Write
    let notionId: string | undefined;
    try {
        const nid = await createAttendanceRecordInNotion({
            eventId,
            userEmail: user.email,
            userName: user.name,
            userDept: user.dept,
            startTime: now
        });
        if (nid) notionId = nid;
        
        // If successful, immediately update end time in Notion too (or handle in create if supported)
        if (nid) {
             updateAttendanceRecordInNotion(nid, { endTime: now }).catch(console.error);
        }
    } catch (e) {
        console.error('Notion attendance write failed:', e);
    }

    // 2. Local Write
	const newRecord: AttendanceRecord = {
		id: notionId ?? crypto.randomUUID(),
        notionId,
		eventId,
		userEmail: user.email,
		userName: user.name,
		userDept: user.dept,
		startTime: now,
        endTime: now, // Complete attendance
		status: 'pending'
	};
	queue.push(newRecord);
	await writeJson(ATTENDANCE_QUEUE_PATH, queue);
	return { record: newRecord, isNew: true };
}

export async function updateAttendanceRecord(recordId: string, updates: { startTime?: string; endTime?: string }) {
	const queue = await getAttendanceQueue();
	const record = queue.find(r => r.id === recordId);
	if (record) {
		if (updates.startTime) record.startTime = updates.startTime;
		if (updates.endTime) record.endTime = updates.endTime;
        
        // Sync to Notion
        if (record.notionId) {
            updateAttendanceRecordInNotion(record.notionId, updates).catch(console.error);
        }

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
        
        // Sync to Notion
        if (record.notionId) {
            updateAttendanceRecordInNotion(record.notionId, { status }).catch(console.error);
        }

		await writeJson(ATTENDANCE_QUEUE_PATH, queue);
	}
}

export async function removeAttendanceRecord(recordId: string) {
    let queue = await getAttendanceQueue();
    const record = queue.find(r => r.id === recordId);
    
    if (record && record.notionId) {
        removeAttendanceRecordInNotion(record.notionId).catch(console.error);
    }

    queue = queue.filter(r => r.id !== recordId);
    await writeJson(ATTENDANCE_QUEUE_PATH, queue);
}
