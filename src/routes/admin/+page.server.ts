import { redirect } from '@sveltejs/kit';
import { 
    getApplications, isAdmin, removeApplication, getWithdrawalRequests, removeWithdrawalRequest 
} from '$lib/server/admin';
import { 
    createMember, getAllMembers, withdrawMember, getMemberByEmail, 
    createActivityPage, addAttendeeToActivity 
} from '$lib/server/notion';
import { 
    getEvents, updateEventStatus, deleteEvent, getAttendanceQueue, 
    updateAttendanceStatus, getEvent 
} from '$lib/server/events';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email || !isAdmin(session.user.email)) {
		throw redirect(302, '/');
	}

	const [apps, members, withdrawalRequests, events, attendanceQueue] = await Promise.all([
		getApplications(),
		getAllMembers(),
		getWithdrawalRequests(),
        getEvents(),
        getAttendanceQueue()
	]);

	return {
		applications: apps,
		members: members,
		withdrawalRequests: withdrawalRequests,
        events: events.reverse(), // Newest first
        attendanceQueue: attendanceQueue.filter(r => r.status === 'pending')
	};
};

export const actions = {
	approve: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const id = data.get('id') as string;
		
		const apps = await getApplications();
		const app = apps.find(a => a.id === id);

		if (!app) return { error: 'Application not found' };

		try {
			await createMember({
				name: app.name,
				email: app.email,
				phone: app.phone,
				department: app.department,
				bio: app.bio,
				background: app.background
			});
			
			await removeApplication(id);
			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Notion creation failed: ' + (e as Error).message };
		}
	},

	reject: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const id = data.get('id') as string;

		await removeApplication(id);
		return { success: true };
	},

	withdraw: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const id = data.get('id') as string;

		try {
			await withdrawMember(id);
			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Withdrawal failed: ' + (e as Error).message };
		}
	},

	approveWithdraw: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const email = data.get('email') as string;

		try {
			const member = await getMemberByEmail(email);
			if (!member) throw new Error('Member not found for email: ' + email);

			await withdrawMember(member.memberId);
			await removeWithdrawalRequest(email);
			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Withdrawal failed: ' + (e as Error).message };
		}
	},

	rejectWithdraw: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const email = data.get('email') as string;

		await removeWithdrawalRequest(email);
		return { success: true };
	},

    // --- Event Management ---

    activateEvent: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        
        const data = await request.formData();
        const id = data.get('id') as string;
        
        // When activating, we could create the Notion Page immediately to ensure it exists.
        // Or wait until attendance approval. 
        // Prompt: "activate button creates and activates the page"
        // Let's create Notion Page now.
        const event = await getEvent(id);
        if (!event) return { error: 'Event not found' };

        if (!event.notionPageId) {
            try {
                const page = await createActivityPage({
                    title: event.title,
                    date: event.date,
                    type: event.type
                });
                await updateEventStatus(id, 'active', page.id);
            } catch(e) {
                console.error(e);
                return { error: 'Failed to create Notion Page' };
            }
        } else {
            await updateEventStatus(id, 'active');
        }
        return { success: true };
    },

    expireEvent: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        const data = await request.formData();
        await updateEventStatus(data.get('id') as string, 'expired');
        return { success: true };
    },

    deleteEvent: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        const data = await request.formData();
        await deleteEvent(data.get('id') as string);
        return { success: true };
    },

    // --- Attendance Review ---

    approveAttendance: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        
        const data = await request.formData();
        const recordId = data.get('id') as string;
        const eventId = data.get('eventId') as string;
        const userEmail = data.get('userEmail') as string;

        try {
            // 1. Get Event & Notion Page
            const event = await getEvent(eventId);
            if (!event || !event.notionPageId) throw new Error('Event or Notion Page not found');

            // 2. Get Member ID
            const memberLink = await getMemberByEmail(userEmail);
            if (!memberLink) throw new Error('Member not found in DB');

            // 3. Add to Notion
            await addAttendeeToActivity(event.notionPageId, memberLink.memberId);

            // 4. Update Status
            await updateAttendanceStatus(recordId, 'approved');
            return { success: true };
        } catch (e) {
            console.error(e);
            return { error: 'Approval failed: ' + (e as Error).message };
        }
    },

    rejectAttendance: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        const data = await request.formData();
        await updateAttendanceStatus(data.get('id') as string, 'rejected');
        return { success: true };
    }
};
