import { fail, redirect } from '@sveltejs/kit';
import { createSeminarRequest } from '$lib/server/seminars';
import { getAllMembers, getAllPrivateInfo } from '$lib/server/notion';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const session = await locals.auth();
    if (!session?.user) throw redirect(302, '/login');

    const [members, privateInfos] = await Promise.all([
        getAllMembers(),
        getAllPrivateInfo()
    ]);

    // Create a map for quick lookup
    const memberMap = new Map(members.map(m => [m.id, m]));

    const searchableMembers = privateInfos
        .filter(p => p.memberId && memberMap.has(p.memberId))
        .map(p => {
            const member = memberMap.get(p.memberId!)!;
            return {
                id: member.id, // We use the Member Database ID for relations
                name: member.name,
                department: member.department,
                email: p.email
            };
        });

    return { 
        user: session.user,
        members: searchableMembers
    };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !session.user.name) return fail(401, { error: 'Unauthorized' });

        const data = await request.formData();
        const title = data.get('title') as string;
        const dateRaw = data.get('date') as string;
        const timezone = data.get('timezone') as string;
        const speakerIdsRaw = data.get('speakerIds') as string; // Expecting comma separated or JSON
        
        let speakerIds: string[] = [];
        if (speakerIdsRaw) {
            try {
                speakerIds = JSON.parse(speakerIdsRaw);
            } catch {
                speakerIds = speakerIdsRaw.split(',').filter(id => id.trim());
            }
        }

        if (!title || !dateRaw) {
            return fail(400, { error: 'Missing required fields' });
        }

        try {
            // Calculate ISO date with timezone
            const dateObj = new Date(dateRaw);
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone || 'Asia/Seoul', // Fallback to KST
                timeZoneName: 'longOffset'
            }).formatToParts(dateObj);
            
            const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value;
            const offset = offsetPart ? offsetPart.replace('GMT', '') : '+09:00';
            const isoOffset = offset === 'GMT' ? '+00:00' : offset;
            
            const date = `${dateRaw}:00${isoOffset}`;

            await createSeminarRequest({
                title,
                date,
                applicantEmail: session.user.email,
                applicantName: session.user.name,
                speakerIds
            });
            return { success: true };
        } catch (e) {
            console.error(e);
            return { error: 'Application failed' };
        }
    }
};
