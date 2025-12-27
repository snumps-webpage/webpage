import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/core/providers/google';
import { env } from '$env/dynamic/private';

const ALLOWED_DOMAIN = 'snu.ac.kr';

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [
		Google({
			clientId: env.GOOGLE_CLIENT_ID!,
			clientSecret: env.GOOGLE_CLIENT_SECRET!
		})
	],
	secret: env.AUTH_SECRET,
	trustHost: true,
	callbacks: {
		signIn: async ({ user }) => {
			const email = user.email;
			if (!email) {
				return false;
			}

			// @snu.ac.kr 도메인만 허용
			if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
				return `/login?error=InvalidDomain`;
			}

			return true;
		},
		session: async ({ session, token }) => {
			if (session.user && token.sub) {
				session.user.id = token.sub;
			}
			return session;
		}
	},
	pages: {
		signIn: '/login',
		error: '/login'
	}
});
