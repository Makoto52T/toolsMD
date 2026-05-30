import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppBuilder from '@/components/AppBuilder';
import pool from '@/lib/db';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const userId = (session.user as any).id;
  const [projects] = await pool.query(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [userId]
  );

  return <AppBuilder session={session} initialProject={(projects as any[])[0] || null} />;
}
