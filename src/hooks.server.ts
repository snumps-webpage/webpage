import { syncEventStatuses } from '$lib/server/events';
export { handle } from './auth';

// Run the event status sync every minute
// NOTE: This will only run in a long-running server environment (e.g. `npm run dev` or a Node adapter).
// It will not work reliably on serverless platforms.
setInterval(() => {
    console.log('Syncing event statuses...');
    syncEventStatuses();
}, 60 * 1000);
