import { error, redirect } from '@sveltejs/kit';
import { getEventByPathId, recordAttendanceStart, recordAttendanceEnd } from '$lib/server/events';
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

    // Validate if the type param matches attendCode or leaveCode
    let actionType: 'attend' | 'leave';
    if (params.type === event.attendCode) {
        actionType = 'attend';
    } else if (params.type === event.leaveCode) {
        actionType = 'leave';
    } else {
        throw error(404, 'Invalid event page code');
    }
    
    return {
        event,
        user: session.user,
        actionType
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

        if (params.type !== event.leaveCode) return { error: 'Invalid code for leaving' };

        const result = await recordAttendanceEnd(event.id, session.user.email);
        
        if (!result.record) return { error: 'Not Attended', message: '출석 기록이 없습니다.' };
        if (!result.updated) return { error: 'Duplicate', message: '이미 퇴장하셨습니다.' };

        // Notify admins via email using the user's access token
        const { sendAttendanceNotification } = await import('$lib/server/mail');
        const accessToken = (session as any).accessToken;
        if (accessToken && session.user.name) {
            await sendAttendanceNotification(accessToken, session.user.name, event.title);
        }

        return { success: true };
    }
};
