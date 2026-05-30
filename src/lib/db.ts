import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'dtm_user',
  password: process.env.MYSQL_PASSWORD || 'REDACTED_MYSQL_PASSWORD',
  database: 'diagram_to_markdown',
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
