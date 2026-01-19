import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Client } from '@notionhq/client';

export const GET = async () => {
    interface DiagInfo {
        env: {
            NOTION_API_KEY: boolean;
            NOTION_DB_MEMBERS: string | undefined;
            NOTION_DB_PRIVATE_INFO: string | undefined;
        };
        notion: {
            success: boolean;
            name?: string;
            error?: string;
        } | string;
    }

    const diag: DiagInfo = {
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
        const me = await notion.users.me({});
        diag.notion = { success: true, name: 'name' in me ? me.name || 'Unknown' : 'Unknown' };
    } catch (e) {
        diag.notion = { success: false, error: (e as Error).message };
    }

    return json(diag);
};
