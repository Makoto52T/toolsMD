import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import pool from '@/lib/db';

const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          redirect_uri: `${baseUrl}/api/auth/google/callback`,
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        await pool.query(
          `INSERT INTO users (id, email, name, image, provider, provider_id)
           VALUES (?, ?, ?, ?, 'google', ?)
           ON DUPLICATE KEY UPDATE name=VALUES(name), image=VALUES(image), last_login=NOW()`,
          [account.providerAccountId, user.email, user.name, user.image, account.providerAccountId]
        );
      }
      return true;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
};
