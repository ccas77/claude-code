import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { db, schema } from './lib/db/client';

/**
 * Google sign-in with an email allowlist — same gate as bookshelf.
 *
 * Only emails listed in ALLOWED_EMAILS get through; the check fails closed
 * when the list is empty and returns a generic failure so it doesn't leak
 * which emails are on the list. JWT session strategy keeps auth stateless.
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
      if (list.size === 0) return false; // fail closed
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
      if (token.email && session.user) session.user.email = token.email as string;
      return session;
    },
  },
});
