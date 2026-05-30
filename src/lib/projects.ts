import pool from '@/lib/db';

export async function getFirstProject(userId: string) {
  const [rows] = await pool.query(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [userId]
  );
  return (rows as any[])[0] || null;
}
