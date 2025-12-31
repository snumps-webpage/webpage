import { error, redirect } from '@sveltejs/kit';
import { getEventByPathId, recordAttendance } from '$lib/server/events';
import { getMemberByEmail, getAllMembers } from '$lib/server/notion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const session = await locals.auth();
	
	if (!session?.user?.email) {
        throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
    }

    const event = await getEventByPathId(params.id);
    if (!event) throw error(404, 'Event not found');
    
    if (event.status !== 'active') throw error(403, 'Event is not active');

    // Validate code
    if (params.type !== event.attendCode) {
        throw error(404, 'Invalid event page code');
    }
    
    return {
        event,
        user: session.user,
        actionType: 'attend'
    };
};

export const actions = {
    attend: async ({ params, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !session.user.name) return { error: 'Unauthorized' };

        const event = await getEventByPathId(params.id);
        if (!event || event.status !== 'active') return { error: 'Invalid event' };

        if (params.type !== event.attendCode) return { error: 'Invalid code for attendance' };

        // Fetch Department
        let dept = 'Unknown';
        try {
            const members = await getAllMembers();
            const memberLink = await getMemberByEmail(session.user.email);
            if (memberLink) {
                const member = members.find(m => m.id === memberLink.memberId);
                if (member) dept = member.department;
            }
        } catch (e) {
            console.error('Failed to fetch department:', e);
        }
        
        const result = await recordAttendance(event.id, {
            email: session.user.email,
            name: session.user.name,
            dept
        });

        if (!result.isNew) {
            return { error: 'Duplicate', message: '이미 출석하셨습니다.' };
        }

        // Notify admins
        const { sendAttendanceNotification } = await import('$lib/server/mail');
        try {
            await sendAttendanceNotification(session.user.name, event.title);
        } catch (e) {
            console.error('Failed to send admin notification:', e);
        }
        
        return { success: true };
    }
};
