import { getAuthSession } from '@/lib/get-auth-session';
import { redirect } from 'next/navigation';
import { getProjects } from '@/lib/projects';
import Link from 'next/link';
import CreateProjectButton from '@/components/CreateProjectButton';
import DeleteProjectButton from '@/components/DeleteProjectButton';

export default async function HomePage() {
  const session = await getAuthSession();
  if (!session?.user) redirect('/login');

  const userId = (session.user as any).id;
  const projects = await getProjects(userId);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        padding: '32px 24px',
      }}
    >
      <style>{`
        .project-list-container { max-width: 900px; margin: 0 auto; }
        .project-list-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .project-list-header h1 { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px; }
        .project-list-header .user-email { font-size: 13px; color: var(--text-muted); margin-left: 8px; }
        .project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
        .project-card { position: relative; display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 10px;
          background: #0d1117; border: 1px solid var(--border); text-decoration: none; color: var(--text-secondary); font-size: 14px;
          font-weight: 500; transition: border-color 0.15s, box-shadow 0.15s; }
        .project-card:hover { border-color: #4493f8; box-shadow: 0 0 0 2px rgba(68,147,248,0.12); }
        .project-card .delete-btn { position: absolute; top: 6px; right: 6px; background: transparent; border: none;
          cursor: pointer; font-size: 14px; opacity: 0; transition: opacity 0.15s; padding: 2px 4px; border-radius: 4px; line-height: 1; }
        .project-card:hover .delete-btn { opacity: 1; }
        .project-card .delete-btn:hover { background: rgba(239,68,68,0.15); }
        .project-card .card-icon { font-size: 20px; flex-shrink: 0; }
        .project-card .card-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .project-card .card-date { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .empty-state { text-align: center; padding: 80px 24px; color: var(--text-muted); }
        .empty-state .empty-icon { font-size: 48px; margin-bottom: 16px; }
        .empty-state p { font-size: 15px; margin: 0 0 24px; line-height: 1.6; }
        .logout-link { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 13px;
          text-decoration: none; margin-left: auto; }
        .logout-link:hover { color: #f87171; }
      `}</style>

      <div className="project-list-container">
        <div className="project-list-header">
          <h1>
            🧩 toolsMD
          </h1>
          <span className="user-email">
            {session.user?.name || session.user?.email}
          </span>
          <a href="/api/auth/signout" className="logout-link">🚪 Logout</a>
        </div>

        <div className="project-grid">
            <CreateProjectButton />
            {projects.map((p: any) => (
              <Link key={p.id} href={`/project/${p.id}`} className="project-card">
                <span className="card-icon">📁</span>
                <div>
                  <div className="card-name">{p.name}</div>
                  <div className="card-date">
                    {p.updated_at
                      ? new Date(p.updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : ''}
                  </div>
                </div>
                <DeleteProjectButton projectId={p.id} projectName={p.name} />
              </Link>
            ))}
          </div>
      </div>
    </div>
  );
}
