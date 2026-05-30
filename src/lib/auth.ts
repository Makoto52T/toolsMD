import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import pool from '@/lib/db';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    CredentialsProvider({
      id: 'admin',
      name: 'Admin Access',
      credentials: {
        secret: { label: 'Secret Key', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.secret) return null;
        const adminKey = process.env.ADMIN_SECRET_KEY;
        if (!adminKey) return null;
        if (credentials.secret !== adminKey) return null;
        return {
          id: 'admin-hermes',
          name: 'Hermes Agent',
          email: 'hermes@metabot.local',
          image: null,
        };
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
      // admin credentials — skip DB
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
