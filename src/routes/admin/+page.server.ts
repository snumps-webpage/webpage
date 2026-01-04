import { error } from '@sveltejs/kit';
import { 
    getApplications, isAdmin, removeApplication 
} from '$lib/server/admin';
import { 
    createMember, getAllMembers, getMemberByEmail, 
    createActivityPage, addAttendeeToActivity, markApplicationAsAccepted 
} from '$lib/server/notion';
import { 
    getEvents, updateEventStatus, deleteEvent, getAttendanceQueue, 
    updateAttendanceStatus, getEvent, removeAttendanceRecord, updateAttendanceRecord,
    createEvent
} from '$lib/server/events';
import { 
    getSeminarRequests, deleteSeminarRequest, updateSeminarRequestStatus 
} from '$lib/server/seminars';
import { sendSeminarStatusNotification, sendWelcomeEmail } from '$lib/server/mail';
import { invalidateCache } from '$lib/server/cache';
import { normalizePhoneNumber } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email || !isAdmin(session.user.email)) {
		throw error(404, 'Not Found');
	}

	const [apps, members, events, attendanceQueue, seminarRequests] = await Promise.all([
		getApplications(),
		getAllMembers(),
        getEvents(),
        getAttendanceQueue(),
        getSeminarRequests()
	]);

    // Enhanced Applications: Sort by date ASC and check membership
    const sortedApps = apps
        .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
        .map(app => ({
            ...app,
            isAlreadyMember: members.some(m => {
                // We need email to check membership, but members list only has name/dept/joinDate?
                // Wait, Notion member DB might not have email in the "Public" Member record.
                // But we can check if a member relation exists for this email via getMemberByEmail.
                // However, doing that in a loop is slow.
                // Better approach: notion.ts getAllMembers should include a way to match.
                // Let's assume for now we match by name + department if email is missing in the list,
                // OR I will check if I can get all private info to match emails.
                return m.name === app.name && m.department === app.department;
            })
        }));

    // Map speaker IDs to names for the UI
    const requestWithSpeakers = seminarRequests
        .filter(r => r.status === 'pending')
        .map(r => ({
            ...r,
            speakerNames: r.speakerIds?.map(id => {
                const m = members.find(member => member.id === id);
                return m ? m.name : 'Unknown';
            }) || []
        }));

	return {
		applications: sortedApps,
		members: members,
        events: events.reverse(), // Newest first
        attendanceQueue: attendanceQueue.filter(r => r.status === 'pending'),
        seminarRequests: requestWithSpeakers
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
            console.log(`Starting approval for ${app.name} (${app.email})...`);
            const normalizedPhone = normalizePhoneNumber(app.phone);
            
            // 1. Create Member record in Notion
			await createMember({
				name: app.name,
				email: app.email,
				phone: normalizedPhone,
				department: app.department,
				background: app.background
			});
            console.log('Successfully created Notion member records.');
			
			invalidateCache(`member_${app.email}`);
            
            // 2. Send Welcome Email
            await sendWelcomeEmail(app.email, app.name);
            console.log('Successfully dispatched welcome email.');

            // 3. Mark as accepted in Notion
            await markApplicationAsAccepted(id);
            console.log('Successfully updated application status in Notion.');

			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Approval failed: ' + (e as Error).message };
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

    // --- Event Management ---

    activateEvent: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        
        const data = await request.formData();
        const id = data.get('id') as string;
        
        const event = await getEvent(id);
        if (!event) return { error: 'Event not found' };

        // Ensure a corresponding activity page exists in Notion before activation
        if (!event.notionPageId) {
            try {
                const page = await createActivityPage({
                    title: event.title,
                    date: event.date,
                    timeZone: event.timeZone,
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
            invalidateCache(`user_activities_${memberLink.memberId}`);

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
    },

    updateAttendanceTime: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        
        const data = await request.formData();
        const id = data.get('id') as string;
        const startTime = data.get('startTime') as string;
        const endTime = data.get('endTime') as string;

        const updates: { startTime?: string; endTime?: string } = {};
        if (startTime) updates.startTime = new Date(startTime).toISOString();
        if (endTime) updates.endTime = new Date(endTime).toISOString();
        
        await updateAttendanceRecord(id, updates);
        return { success: true };
    },

    deleteAttendanceRecord: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };
        const data = await request.formData();
        await removeAttendanceRecord(data.get('id') as string);
        return { success: true };
    },

    // --- Seminar Management ---

    approveSeminar: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };

        const data = await request.formData();
        const id = data.get('id') as string;
        const requests = await getSeminarRequests();
        const seminar = requests.find(r => r.id === id);

        if (!seminar) return { error: 'Request not found' };

        try {
            const now = new Date().toISOString();

            // 1. Create Activity Page in Notion with speakers linked
            const page = await createActivityPage({
                title: seminar.title,
                date: now,
                type: 'Seminar',
                attendeeIds: seminar.speakerIds
            });

            // 2. Create Event for Attendance Tracking
            await createEvent({
                title: seminar.title,
                date: now,
                type: 'Seminar',
                notionPageId: page.id
            });

            // 3. Update Request Status
            await updateSeminarRequestStatus(id, 'approved');

            // 4. Notify Speaker(s)
            if (seminar.speakerIds.length > 0) {
                const { getMemberById, getPrivateInfo } = await import('$lib/server/notion');
                const member = await getMemberById(seminar.speakerIds[0]);
                if (member?.privateInfoId) {
                    const info = await getPrivateInfo(member.privateInfoId);
                    if (info?.email) {
                        await sendSeminarStatusNotification(info.email, member.name, seminar.title, 'approved');
                    }
                }
            }

            return { success: true };
        } catch (e) {
            console.error(e);
            return { error: 'Approval failed: ' + (e as Error).message };
        }
    },

    rejectSeminar: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return { error: 'Forbidden' };

        const data = await request.formData();
        const id = data.get('id') as string;
        const requests = await getSeminarRequests();
        const seminar = requests.find(r => r.id === id);

        if (!seminar) return { error: 'Request not found' };

        try {
            // Notify Speaker(s) before deletion
            if (seminar.speakerIds.length > 0) {
                const { getMemberById, getPrivateInfo } = await import('$lib/server/notion');
                const member = await getMemberById(seminar.speakerIds[0]);
                if (member?.privateInfoId) {
                    const info = await getPrivateInfo(member.privateInfoId);
                    if (info?.email) {
                        await sendSeminarStatusNotification(info.email, member.name, seminar.title, 'rejected');
                    }
                }
            }

            await deleteSeminarRequest(id);
            return { success: true };
        } catch (e) {
            console.error(e);
            return { error: 'Rejection/Deletion failed' };
        }
    }
};
