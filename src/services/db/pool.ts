/**
 * Mycelium Protocol -- PostgreSQL Connection Pool
 *
 * Singleton pool for all database operations. Reads DATABASE_URL
 * from environment. Configured for cloud PostgreSQL (Neon/Supabase)
 * with SSL enabled and reasonable pool limits for webhook throughput.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "[mycelium-db] DATABASE_URL not set. PostgreSQL operations will fail."
  );
}

/**
 * Singleton connection pool.
 * - max 10 connections (sufficient for webhook + query load)
 * - idle timeout 30s (cloud PG providers charge per-connection)
 * - connection timeout 5s (fail fast on network issues)
 * - SSL with rejectUnauthorized: false for Neon/Supabase compatibility
 */
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined,
});

// Log pool events to stderr (not stdout -- MCP uses stdout for JSON-RPC)
pool.on("connect", () => {
  console.error("[mycelium-db] New client connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("[mycelium-db] Unexpected pool error:", err.message);
});

/**
 * Execute a parameterized SQL query.
 * Always use $1, $2 placeholders -- never string interpolation.
 */
export async function query(
  text: string,
  params?: (string | number | boolean | null | Buffer | bigint)[]
): Promise<pg.QueryResult> {
  return pool.query(text, params);
}

/**
 * Initialize database schema by executing schema.sql.
 * Safe to call multiple times -- all statements use IF NOT EXISTS.
 */
export async function initDatabase(): Promise<void> {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(thisDir, "schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");

  try {
    await pool.query(schemaSql);
    console.error("[mycelium-db] Schema initialized successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mycelium-db] Schema initialization failed:", message);
    throw err;
  }
}

/**
 * Gracefully shut down the pool. Call on process exit.
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.error("[mycelium-db] Pool closed");
}
