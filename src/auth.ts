import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/core/providers/google';
import { env } from '$env/dynamic/private';

const ALLOWED_DOMAIN = 'snu.ac.kr';

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [
		Google({
			clientId: env.GOOGLE_CLIENT_ID!,
			clientSecret: env.GOOGLE_CLIENT_SECRET!,
			authorization: {
				params: {
					scope: 'openid email profile https://www.googleapis.com/auth/gmail.send'
				}
			}
		})
	],
	secret: env.AUTH_SECRET,
	trustHost: true,
	callbacks: {
		signIn: async ({ user }) => {
			const email = user.email;
			if (!email) return false;

			// Strictly enforce Seoul National University email domain
			if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
				return `/login?error=InvalidDomain`;
			}

			return true;
		},
		jwt: async ({ token, account }) => {
			if (account) {
				token.accessToken = account.access_token;
			}
			return token;
		},
		session: async ({ session, token }) => {
			// Expose the unique Auth.js user ID and access token to the session object
			if (session.user) {
				if (token.sub) session.user.id = token.sub;
				(session as any).accessToken = token.accessToken;
			}
			return session;
		}
	},
	pages: {
		signIn: '/login',
		error: '/login'
	}
});
