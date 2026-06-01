import mysql from 'mysql2/promise';

// Connection pool for the VPS MySQL instance.
// Mirrors the diagram-to-markdown pattern: a single module-scoped pool
// reused across serverless invocations (mysql2 handles pooling per lambda).
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'dtm_user',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'diagram_to_markdown',
  waitForConnections: true,
  connectionLimit: 10,
  // Serverless: keep the pool small and let idle connections die.
  enableKeepAlive: true,
});

export default pool;
