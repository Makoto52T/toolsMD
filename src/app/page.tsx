import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getFirstProject } from '@/lib/projects';
import AppBuilder from '@/components/AppBuilder';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const userId = (session.user as any).id;
  const initialProject = await getFirstProject(userId);

  return <AppBuilder session={session} initialProject={initialProject} />;
}
