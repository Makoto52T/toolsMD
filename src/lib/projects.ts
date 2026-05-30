import pool from '@/lib/db';

export async function getProjects(userId: string) {
  const [rows] = await pool.query(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
    [userId]
  );
  return rows as any[];
}

export async function getProjectById(projectId: string, userId: string) {
  const [rows] = await pool.query(
    'SELECT * FROM projects WHERE id = ? AND user_id = ?',
    [projectId, userId]
  );
  return (rows as any[])[0] || null;
}
