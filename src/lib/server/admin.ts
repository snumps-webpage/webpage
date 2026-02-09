/**
 * Service for managing club membership applications stored in Notion.
 */
import { env } from '$env/dynamic/private';
import {
	getApplicationsFromNotion,
	createApplicationInNotion,
	removeApplicationInNotion
} from './notion';

export interface Application {
	id: string;
	email: string;
	name: string;
	phone: string;
	department: string;
	background: string;
	accepted: boolean;
	submittedAt: string;
}

export async function getApplications(skipCache = false): Promise<Application[]> {
	try {
		return await getApplicationsFromNotion(skipCache);
	} catch (e) {
		console.error('Failed to fetch applications from Notion:', e);
		return [];
	}
}

export async function addApplication(app: Omit<Application, 'id' | 'submittedAt' | 'accepted'>) {
	try {
		const id = await createApplicationInNotion(app);
		return { ...app, id, submittedAt: new Date().toISOString(), accepted: false };
	} catch (e) {
		console.error('Failed to create application in Notion:', e);
		throw e;
	}
}

export async function updateApplication(id: string, app: Omit<Application, 'id' | 'submittedAt' | 'accepted' | 'email'>) {
	try {
		const { updateApplicationInNotion } = await import('./notion');
		await updateApplicationInNotion(id, app);
	} catch (e) {
		console.error('Failed to update application in Notion:', e);
		throw e;
	}
}

export async function removeApplication(id: string) {
	try {
		await removeApplicationInNotion(id);
	} catch (e) {
		console.error('Failed to remove application from Notion:', e);
	}
}

export function isAdmin(email: string | null | undefined) {
	if (!email) return false;
	const admins = (env.ADMINS_EMAILS || '').split(',').map(e => e.trim());
	return admins.includes(email);
}

