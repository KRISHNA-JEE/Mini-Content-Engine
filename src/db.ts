import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export function getDatabaseConfig(): { connectionString: string; ssl: false | { rejectUnauthorized: boolean } } {
  return {
    connectionString: connectionString as string,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  };
}

export const pool = new Pool({
  ...getDatabaseConfig(),
});

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    description TEXT NOT NULL,
    reference_image_url TEXT,
    generated_prompt TEXT,
    result_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const MIGRATION_SQL = `
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'jobs'
        AND column_name = 'id'
        AND data_type <> 'text'
    ) THEN
      ALTER TABLE jobs ALTER COLUMN id TYPE TEXT USING id::text;
    END IF;
  END $$;

  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reference_image_url TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS generated_prompt TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result_image_url TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

  UPDATE jobs SET status = 'pending' WHERE status IS NULL;
  UPDATE jobs SET created_at = now() WHERE created_at IS NULL;
  UPDATE jobs SET updated_at = now() WHERE updated_at IS NULL;

  ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'pending';
  ALTER TABLE jobs ALTER COLUMN created_at SET DEFAULT now();
  ALTER TABLE jobs ALTER COLUMN updated_at SET DEFAULT now();

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'jobs_status_check'
        AND conrelid = 'jobs'::regclass
    ) THEN
      ALTER TABLE jobs
      ADD CONSTRAINT jobs_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
    END IF;
  END $$;
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  await pool.query(MIGRATION_SQL);
}

let schemaInitPromise: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!schemaInitPromise) {
    schemaInitPromise = initSchema().catch((err) => {
      schemaInitPromise = null;
      throw err;
    });
  }

  return schemaInitPromise;
}
