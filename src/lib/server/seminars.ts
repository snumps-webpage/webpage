import type { SeminarRequest } from '$lib/types';
import { 
    getSeminarRequestsFromNotion, 
    createSeminarRequestInNotion, 
    updateSeminarRequestStatusInNotion,
    removeSeminarRequestInNotion
} from './notion';

export async function getSeminarRequests(): Promise<SeminarRequest[]> {
    try {
        const results = await getSeminarRequestsFromNotion();
        return results as SeminarRequest[];
    } catch (e) {
        console.error('Failed to fetch seminar requests from Notion:', e);
        return [];
    }
}

export async function deleteSeminarRequest(id: string) {
    try {
        await removeSeminarRequestInNotion(id);
    } catch (e) {
        console.error('Failed to delete seminar request from Notion:', e);
        throw e;
    }
}

export async function createSeminarRequest(data: { 
    title: string; 
    description: string; 
    prerequisites: string; 
    duration: string; 
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
        };
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
