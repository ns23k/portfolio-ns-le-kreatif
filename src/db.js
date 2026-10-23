const mysql = require('mysql2/promise');

let pool = globalThis.__nkPool;

function buildConfig() {
  const useSSL = String(process.env.DB_SSL ?? 'true').toLowerCase() !== 'false';
  const ssl = useSSL ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined;
  const common = {
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL || 5),
    maxIdle: 2,
    idleTimeout: 60000,
    enableKeepAlive: true,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false,
    ssl,
  };
  if (process.env.DATABASE_URL) {
    return { uri: process.env.DATABASE_URL, ...common };
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'nslekreatif',
    ...common,
  };
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool(buildConfig());
    globalThis.__nkPool = pool;
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

module.exports = { getPool, query };
