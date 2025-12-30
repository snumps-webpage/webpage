import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import path from 'path';

const DB_PATH = 'data/applications.json';

export interface Application {
	id: string;
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
		return JSON.parse(data);
	} catch {
		return [];
	}
}

export async function addApplication(app: Omit<Application, 'id' | 'submittedAt'>) {
	const apps = await getApplications();
	const newApp: Application = {
		...app,
		id: crypto.randomUUID(),
		submittedAt: new Date().toISOString()
	};
	apps.push(newApp);
	
	const filePath = await getDbPath();
	await fs.writeFile(filePath, JSON.stringify(apps, null, 2));
	return newApp;
}

export async function removeApplication(id: string) {
	let apps = await getApplications();
	apps = apps.filter(a => a.id !== id);
	
	const filePath = await getDbPath();
	await fs.writeFile(filePath, JSON.stringify(apps, null, 2));
}

export function isAdmin(email: string | null | undefined) {
	if (!email) return false;
	const admins = (env.ADMINS_EMAILS || '').split(',').map(e => e.trim());
	return admins.includes(email);
}
