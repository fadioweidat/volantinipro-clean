-- migration.sql — VolantiniPro operational tables
-- Apply via Supabase SQL Editor

-- operational_groups
CREATE TABLE IF NOT EXISTS operational_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  lead_driver_id uuid,
  lead_name text,
  status text DEFAULT 'attivo',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- assigned_zones
CREATE TABLE IF NOT EXISTS assigned_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  group_id uuid,
  zone_name text,
  municipality_name text,
  municipality_code text,
  target_km numeric DEFAULT 0,
  total_civici integer DEFAULT 0,
  total_strade integer DEFAULT 0,
  geom jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- admin_coverage_corrections
CREATE TABLE IF NOT EXISTS admin_coverage_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  group_id uuid,
  driver_id uuid,
  admin_id uuid,
  correction_type text NOT NULL CHECK (correction_type IN ('coperto_manualmente','validato_admin','da_rifare')),
  reason text,
  label text,
  notes text,
  estimated_km numeric DEFAULT 0,
  geom jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- colonne mancanti su delivery_sessions
ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS zone_name text;
ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS municipality_name text;

-- RLS permissive per ora
ALTER TABLE operational_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_operational_groups" ON operational_groups;
DROP POLICY IF EXISTS "service_write_operational_groups" ON operational_groups;
CREATE POLICY "public_read_operational_groups" ON operational_groups FOR SELECT USING (true);
CREATE POLICY "service_write_operational_groups" ON operational_groups FOR ALL USING (true);

ALTER TABLE assigned_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_assigned_zones" ON assigned_zones;
DROP POLICY IF EXISTS "service_write_assigned_zones" ON assigned_zones;
CREATE POLICY "public_read_assigned_zones" ON assigned_zones FOR SELECT USING (true);
CREATE POLICY "service_write_assigned_zones" ON assigned_zones FOR ALL USING (true);

ALTER TABLE admin_coverage_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_corrections" ON admin_coverage_corrections;
DROP POLICY IF EXISTS "service_write_corrections" ON admin_coverage_corrections;
CREATE POLICY "public_read_corrections" ON admin_coverage_corrections FOR SELECT USING (true);
CREATE POLICY "service_write_corrections" ON admin_coverage_corrections FOR ALL USING (true);
