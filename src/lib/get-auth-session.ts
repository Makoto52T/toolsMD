import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { headers } from 'next/headers';
import { Session } from 'next-auth';

/**
 * Get session with admin bypass support.
 * If x-admin-key header matches ADMIN_SECRET_KEY, returns a mock admin session.
 * Otherwise, uses standard NextAuth getServerSession.
 */
export async function getAuthSession(): Promise<Session | null> {
  // Check for admin bypass header
  try {
    const headersList = await headers();
    const adminHeader = headersList.get('x-admin-key');
    const adminKey = process.env.ADMIN_SECRET_KEY;

    if (adminHeader && adminKey && adminHeader === adminKey) {
      return {
        user: {
          id: 'admin-hermes',
          name: 'Hermes Agent',
          email: 'hermes@metabot.local',
          image: null,
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      } as Session;
    }
  } catch {
    // headers() may throw in some contexts — fall through to standard auth
  }

  return getServerSession(authOptions);
}
