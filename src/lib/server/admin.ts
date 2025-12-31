/**
 * Service for managing club membership applications stored in local JSON.
 */
import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import path from 'path';
import { 
	getApplicationsFromNotion, 
	createApplicationInNotion, 
	removeApplicationInNotion 
} from './notion';

const DB_PATH = 'data/applications.json';

export interface Application {
	id: string;
	notionId?: string; // Link to Notion record
	email: string;
	name: string;
	phone: string;
	department: string;
	bio: string;
	background: string;
	submittedAt: string;
}

async function getDbPath() {
	const dir = path.dirname(DB_PATH);
	try {
		await fs.access(dir);
	} catch {
		await fs.mkdir(dir, { recursive: true });
	}
	return DB_PATH;
}

export async function getApplications(): Promise<Application[]> {
	try {
		const filePath = await getDbPath();
		const data = await fs.readFile(filePath, 'utf-8');
		const apps = JSON.parse(data);
		
		// Fallback/Sync: If local cache is empty but Notion might have data,
		// or strictly if we want to ensure availability.
		// User requested: "mainly accessing the local .json file first, and checking Notion as a fallback."
		if (apps.length === 0) {
			console.log('Local applications cache empty, fetching from Notion...');
			const notionApps = await getApplicationsFromNotion();
			if (notionApps.length > 0) {
				// Transform Notion app structure to local structure if needed, 
				// though we matched them in notion.ts.
				await fs.writeFile(filePath, JSON.stringify(notionApps, null, 2));
				return notionApps as Application[];
			}
		}
		return apps;
	} catch (e) {
		console.warn('Failed to read local applications, falling back to Notion:', e);
		try {
			const notionApps = await getApplicationsFromNotion();
			// Attempt to restore cache
			const filePath = await getDbPath();
			await fs.writeFile(filePath, JSON.stringify(notionApps, null, 2));
			return notionApps as Application[];
		} catch (notionError) {
			console.error('Failed to fetch from Notion:', notionError);
			return [];
		}
	}
}

export async function addApplication(app: Omit<Application, 'id' | 'submittedAt'>) {
	// 1. Write to Notion (Source of Truth for persistence/server-sharing)
	let notionId: string | undefined;
	try {
		const id = await createApplicationInNotion(app);
		if (id) notionId = id;
	} catch (e) {
		console.error('Failed to create application in Notion:', e);
		// Proceed to local write anyway? 
		// If Notion fails, we might still want to accept the signup locally.
	}

	// 2. Write to Local JSON (Cache)
	const apps = await getApplications();
	const newApp: Application = {
		...app,
		id: notionId ?? crypto.randomUUID(), // Use Notion ID if available, else random
		notionId: notionId,
		submittedAt: new Date().toISOString()
	};
	apps.push(newApp);
	
	const filePath = await getDbPath();
	await fs.writeFile(filePath, JSON.stringify(apps, null, 2));
	return newApp;
}

export async function removeApplication(id: string) {
	let apps = await getApplications();
	const appToRemove = apps.find(a => a.id === id);
	
	if (appToRemove && appToRemove.notionId) {
		try {
			await removeApplicationInNotion(appToRemove.notionId);
		} catch (e) {
			console.error('Failed to remove application from Notion:', e);
		}
	}

	apps = apps.filter(a => a.id !== id);
	
	const filePath = await getDbPath();
	await fs.writeFile(filePath, JSON.stringify(apps, null, 2));
}

export function isAdmin(email: string | null | undefined) {
	if (!email) return false;
	const admins = (env.ADMINS_EMAILS || '').split(',').map(e => e.trim());
	return admins.includes(email);
}
