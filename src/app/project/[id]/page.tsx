import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getProjectById } from '@/lib/projects';
import AppBuilder from '@/components/AppBuilder';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const userId = (session.user as any).id;
  const { id } = await params;
  const project = await getProjectById(id, userId);

  if (!project) redirect('/');

  return (
    <AppBuilder
      session={session}
      projectId={project.id}
      projectName={project.name}
    />
  );
}
