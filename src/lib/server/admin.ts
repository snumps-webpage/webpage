/**
 * Service for managing club membership applications using Notion as storage.
 */
import { env } from '$env/dynamic/private';
import { 
	getApplicationsFromNotion, 
	createApplicationInNotion, 
	removeApplicationInNotion 
} from './notion';

export interface Application {
	id: string; // Notion ID
	email: string;
	name: string;
	phone: string;
	department: string;
	background: string;
	submittedAt: string;
}

export async function getApplications(): Promise<Application[]> {
	try {
		return await getApplicationsFromNotion() as Application[];
	} catch (e) {
		console.error('Failed to fetch applications from Notion:', e);
		return [];
	}
}

export async function addApplication(app: Omit<Application, 'id' | 'submittedAt'>) {
	try {
		const id = await createApplicationInNotion(app);
		if (!id) throw new Error('Notion creation returned no ID');
		
		return {
			...app,
			id,
			submittedAt: new Date().toISOString()
		};
	} catch (e) {
		console.error('Failed to create application in Notion:', e);
		throw e; // Propagate error so UI knows
	}
}

export async function removeApplication(id: string) {
	try {
		await removeApplicationInNotion(id);
	} catch (e) {
		console.error('Failed to remove application from Notion:', e);
		throw e;
	}
}

export function isAdmin(email: string | null | undefined) {
	if (!email) return false;
	const admins = (env.ADMINS_EMAILS || '').split(',').map(e => e.trim());
	return admins.includes(email);
}
