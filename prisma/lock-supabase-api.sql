-- Lock the Supabase Data API. This app reads/writes only via Prisma
-- (postgres role), so anon/authenticated must not see public tables.
-- RLS with no policies denies API access; REVOKE is extra hardening.
-- Re-run after `prisma db push` if tables were recreated.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      r.schema_name,
      r.table_name
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE %I.%I FROM anon, authenticated',
      r.schema_name,
      r.table_name
    );
  END LOOP;

  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
END $$;
