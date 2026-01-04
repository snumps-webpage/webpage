import type { SeminarRequest } from '$lib/types';
import { 
    getSeminarRequestsFromNotion, 
    createSeminarRequestInNotion, 
    updateSeminarRequestStatusInNotion 
} from './notion';

export async function getSeminarRequests(): Promise<SeminarRequest[]> {
    try {
        const results = await getSeminarRequestsFromNotion();
        // Map Notion results to SeminarRequest interface if not already done in notion.ts
        // notion.ts returns objects that match SeminarRequest structure loosely but with Notion ID as 'id'.
        // We cast it here.
        return results as SeminarRequest[];
    } catch (e) {
        console.error('Failed to fetch seminar requests from Notion:', e);
        return [];
    }
}

export async function createSeminarRequest(data: { 
    title: string; 
    date: string; 
    timeZone: string; 
    applicantEmail: string; 
    applicantName: string; 
    speakerIds: string[] 
}) {
    try {
        const id = await createSeminarRequestInNotion({
            ...data
        });
        if (!id) throw new Error('Notion creation returned no ID');

        return {
            ...data,
            id,
            status: 'pending',
            submittedAt: new Date().toISOString()
        } as SeminarRequest;
    } catch (e) {
        console.error('Notion seminar request write failed:', e);
        throw e;
    }
}

export async function updateSeminarRequestStatus(id: string, status: 'approved' | 'rejected') {
    try {
        await updateSeminarRequestStatusInNotion(id, status);
        return { id, status };
    } catch (e) {
        console.error('Failed to update seminar request in Notion:', e);
        throw e;
    }
}
