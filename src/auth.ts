import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/core/providers/google';
import { env } from '$env/dynamic/private';

const ALLOWED_DOMAIN = 'snu.ac.kr';

// Fix for Vercel: explicit AUTH_URL ensures basePath resolution works
// Prioritize process.env.VERCEL_URL if AUTH_URL is missing
if (!env.AUTH_URL && process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include https://
    process.env.AUTH_URL = `https://${process.env.VERCEL_URL}/auth`;
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [
		Google({
			clientId: env.GOOGLE_CLIENT_ID!,
			clientSecret: env.GOOGLE_CLIENT_SECRET!
		})
	],
	secret: env.AUTH_SECRET,
	trustHost: true,
    basePath: '/auth',
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
		session: async ({ session, token }) => {
			// Expose the unique Auth.js user ID to the session object for easier lookups
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
