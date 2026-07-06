import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { db, schema } from './lib/db/client';
import { isPrimaryEmail } from './lib/owner-role';

/**
 * Google sign-in with an email allowlist.
 *
 * The signIn callback is the gate: only emails listed in ALLOWED_EMAILS get
 * through. Everyone else is bounced with no session and a generic error so we
 * don't leak which emails are or aren't on the list.
 *
 * On successful sign-in we upsert the user into our existing `users` table,
 * keyed by verified Google email. JWT session strategy keeps the auth path
 * stateless (no extra session table).
 */

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const list = allowedEmails();
      if (list.size === 0) {
        // Fail closed if the allowlist isn't configured; we never want
        // anonymous public access by default.
        return false;
      }
      if (!list.has(email)) return false;

      const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
      });
      if (!existing) {
        await db
          .insert(schema.users)
          .values({ email, name: user.name ?? null })
          .onConflictDoNothing({ target: schema.users.email });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email.toLowerCase();
      return token;
    },
    async session({ session, token }) {
      if (token.email && session.user) {
        session.user.email = token.email as string;
        (session.user as { isPrimary?: boolean }).isPrimary = isPrimaryEmail(
          token.email as string,
        );
      }
      return session;
    },
  },
});
