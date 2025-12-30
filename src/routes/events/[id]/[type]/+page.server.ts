import { error, redirect } from '@sveltejs/kit';
import { getEventByPathId, recordAttendanceStart, recordAttendanceEnd } from '$lib/server/events';
import { getMemberByEmail, getAllMembers } from '$lib/server/notion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const session = await locals.auth();
	// If not logged in, redirect to login with return URL
    // Construct return URL carefully
	if (!session?.user?.email) {
        throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
    }

    const event = await getEventByPathId(params.id);
    if (!event) throw error(404, 'Event not found');
    
    // Status check: users can only access active events
    // Admins might want to preview? But prompt says "expire button block accesses of regular users".
    // So 'active' is required.
    if (event.status !== 'active') throw error(403, 'Event is not active');
    
    return {
        event,
        user: session.user,
        type: params.type
    };
};

export const actions = {
    attend: async ({ params, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !session.user.name) return { error: 'Unauthorized' };

        const event = await getEventByPathId(params.id);
        if (!event || event.status !== 'active') return { error: 'Invalid event' };

        // Fetch Department
        // Optimally we should have a quick lookup, but getAllMembers is cached or fast enough for this prototype?
        // Or we can assume getMemberByEmail returns Dept if we update it.
        // For now, let's fetch all members and find.
        let dept = 'Unknown';
        try {
            const members = await getAllMembers();
            // Match by name? No, getAllMembers returns name/dept.
            // But we don't have email in getAllMembers result.
            // We have getMemberByEmail which gives memberId.
            // Match memberId.
            const memberLink = await getMemberByEmail(session.user.email);
            if (memberLink) {
                const member = members.find(m => m.id === memberLink.memberId);
                if (member) dept = member.department;
            }
        } catch (e) {
            console.error('Failed to fetch department:', e);
        }
        
        const result = await recordAttendanceStart(event.id, {
            email: session.user.email,
            name: session.user.name,
            dept
        });

        if (!result.isNew) {
            return { error: 'Duplicate', message: '이미 출석하셨습니다.' };
        }
        
        return { success: true };
    },

    leave: async ({ params, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email) return { error: 'Unauthorized' };
        
        const { getEventByPathId } = await import('$lib/server/events');
        const event = await getEventByPathId(params.id);
        
        if (!event || event.status !== 'active') return { error: 'Invalid event' };

        const result = await recordAttendanceEnd(event.id, session.user.email);
        
        if (!result.record) return { error: 'Not Attended', message: '출석 기록이 없습니다.' };
        if (!result.updated) return { error: 'Duplicate', message: '이미 퇴장하셨습니다.' };

        return { success: true };
    }
};
