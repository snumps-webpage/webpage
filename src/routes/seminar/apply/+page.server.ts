import { fail, redirect } from '@sveltejs/kit';
import { createSeminarRequest } from '$lib/server/seminars';
import { getAllMembers, getAllPrivateInfo, getMemberByEmail } from '$lib/server/notion';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    const session = await locals.auth();
    if (!session?.user) throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);

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
        const description = data.get('description') as string;
        const prerequisites = data.get('prerequisites') as string;
        const duration = data.get('duration') as string;
        const speakerIdsRaw = data.get('speakerIds') as string;
        
        const member = await getMemberByEmail(session.user.email);
        if (!member) return fail(404, { error: 'Member record not found' });

        let speakerIds: string[] = [];
        if (speakerIdsRaw) {
            try {
                speakerIds = JSON.parse(speakerIdsRaw);
            } catch {
                speakerIds = speakerIdsRaw.split(',').filter(id => id.trim());
            }
        }

        // Default to the applicant themselves if no speakers are explicitly selected
        if (speakerIds.length === 0) {
            speakerIds = [member.memberId];
        }

        if (!title || !description) {
            return fail(400, { error: 'Missing required fields' });
        }

        try {
            await createSeminarRequest({
                title,
                description,
                prerequisites: prerequisites || '',
                duration,
                speakerIds
            });
            return { success: true };
        } catch (e) {
            console.error('Seminar Application Action Error:', e);
            return fail(500, { error: 'Application failed: ' + (e as Error).message });
        }
    }
};
