import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Client } from '@notionhq/client';

export const GET = async () => {
    const diag: any = {
        env: {
            NOTION_API_KEY: !!env.NOTION_API_KEY,
            NOTION_DB_MEMBERS: env.NOTION_DB_MEMBERS,
            NOTION_DB_PRIVATE_INFO: env.NOTION_DB_PRIVATE_INFO
        },
        notion: 'untested'
    };

    try {
        if (!env.NOTION_API_KEY) throw new Error('Missing API Key');
        const notion = new Client({ auth: env.NOTION_API_KEY });
        const me = await (notion.users.me as any)({});
        diag.notion = { success: true, name: me.name };
    } catch (e: any) {
        diag.notion = { success: false, error: e.message };
    }

    return json(diag);
};
