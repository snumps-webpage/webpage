import fs from 'fs/promises';
import path from 'path';
import { 
    getSeminarRequestsFromNotion, 
    createSeminarRequestInNotion, 
    updateSeminarRequestStatusInNotion 
} from './notion';

const SEMINAR_REQUESTS_DB_PATH = 'data/seminar_requests.json';

export interface SeminarRequest {
    id: string;
    notionId?: string;
    title: string;
    date: string;
    applicantEmail: string;
    applicantName: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: string;
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

export async function getSeminarRequests(): Promise<SeminarRequest[]> {
    try {
        const requests = await readJson<SeminarRequest>(SEMINAR_REQUESTS_DB_PATH);
        
        if (requests.length === 0) {
            console.log('Local seminar requests cache empty, checking Notion...');
            const notionRequests = await getSeminarRequestsFromNotion();
            if (notionRequests.length > 0) {
                const mapped = notionRequests.map(r => ({
                    ...r,
                    notionId: r.id
                })) as SeminarRequest[];
                await writeJson(SEMINAR_REQUESTS_DB_PATH, mapped);
                return mapped;
            }
        }
        return requests;
    } catch (e) {
        console.warn('FS read failed, fetching from Notion', e);
        try {
            const results = await getSeminarRequestsFromNotion();
            return results.map(r => ({ ...r, notionId: r.id })) as SeminarRequest[];
        } catch {
            return [];
        }
    }
}

export async function createSeminarRequest(data: { title: string; date: string; applicantEmail: string; applicantName: string }) {
    const requests = await getSeminarRequests();
    
    // 1. Notion Write
    let notionId: string | undefined;
    try {
        const nid = await createSeminarRequestInNotion(data);
        if (nid) notionId = nid;
    } catch (e) {
        console.error('Notion seminar request write failed:', e);
    }

    // 2. Local Write
    const newRequest: SeminarRequest = {
        id: notionId ?? crypto.randomUUID(),
        notionId,
        title: data.title,
        date: data.date,
        applicantEmail: data.applicantEmail,
        applicantName: data.applicantName,
        status: 'pending',
        submittedAt: new Date().toISOString()
    };
    
    requests.push(newRequest);
    await writeJson(SEMINAR_REQUESTS_DB_PATH, requests);
    return newRequest;
}

export async function updateSeminarRequestStatus(id: string, status: 'approved' | 'rejected') {
    const requests = await getSeminarRequests();
    const request = requests.find(r => r.id === id);
    if (request) {
        request.status = status;
        
        if (request.notionId) {
            updateSeminarRequestStatusInNotion(request.notionId, status).catch(console.error);
        }
        
        await writeJson(SEMINAR_REQUESTS_DB_PATH, requests);
        return request;
    }
    return null;
}
