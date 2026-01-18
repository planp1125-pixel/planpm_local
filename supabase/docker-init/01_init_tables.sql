-- Combined Database Initialization for Plan-PM Docker
-- This file creates all tables, RLS policies, and initial data
-- Runs automatically on first container start

-- ============================================================================
-- PROFILES TABLE (for RBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  username text UNIQUE,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'supervisor', 'technician')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated" ON public.profiles 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Profiles updatable by owner" ON public.profiles 
  FOR UPDATE TO authenticated USING (true);

-- ============================================================================
-- MAINTENANCE TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public."maintenanceTypes" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  "createdAt" timestamp with time zone DEFAULT now(),
  user_id uuid
);

INSERT INTO public."maintenanceTypes" (name) VALUES
  ('Calibration'),
  ('Preventative Maintenance'),
  ('Validation'),
  ('AMC')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public."maintenanceTypes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public."maintenanceTypes" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- INSTRUMENT TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public."instrumentTypes" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  user_id uuid
);

ALTER TABLE public."instrumentTypes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public."instrumentTypes" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- TEST TEMPLATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public."testTemplates" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  structure jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamp with time zone DEFAULT now(),
  user_id uuid
);

ALTER TABLE public."testTemplates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public."testTemplates" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- INSTRUMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.instruments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "eqpId" text NOT NULL,
  "instrumentType" text NOT NULL,
  model text NOT NULL,
  "serialNumber" text NOT NULL,
  location text NOT NULL,
  status text,
  "scheduleDate" timestamp with time zone NOT NULL,
  frequency text NOT NULL CHECK (frequency = ANY (ARRAY['Daily', 'Weekly', 'Monthly', '3 Months', '6 Months', '1 Year'])),
  "nextMaintenanceDate" timestamp with time zone NOT NULL,
  "imageId" text NOT NULL,
  "imageUrl" text,
  make text DEFAULT '',
  "maintenanceType" text DEFAULT 'PM',
  user_id uuid,
  "maintenanceBy" text,
  "vendorName" text,
  "vendorContact" text,
  "isActive" boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_instruments_user_id ON public.instruments(user_id);
CREATE INDEX IF NOT EXISTS idx_instruments_is_active ON public.instruments("isActive");

ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public.instruments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- MAINTENANCE CONFIGURATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  maintenance_type text NOT NULL,
  frequency text NOT NULL CHECK (frequency = ANY (ARRAY['Daily', 'Weekly', 'Monthly', '3 Months', '6 Months', '1 Year'])),
  schedule_date timestamp with time zone NOT NULL,
  template_id uuid REFERENCES public."testTemplates"(id) ON DELETE SET NULL,
  user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  "maintenanceBy" text,
  "vendorName" text,
  "vendorContact" text,
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_maintenance_configs_instrument ON public.maintenance_configurations(instrument_id);

ALTER TABLE public.maintenance_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public.maintenance_configurations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- MAINTENANCE SCHEDULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public."maintenanceSchedules" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "instrumentId" uuid REFERENCES public.instruments(id) ON DELETE CASCADE,
  "dueDate" timestamp with time zone NOT NULL,
  type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL,
  notes text,
  "completedDate" timestamp with time zone,
  "completionNotes" text,
  user_id uuid,
  template_id uuid REFERENCES public."testTemplates"(id) ON DELETE SET NULL,
  "vendorName" text,
  "vendorContact" text,
  "maintenanceBy" text,
  is_last_of_year boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_schedules_due_date ON public."maintenanceSchedules"("dueDate");
CREATE INDEX IF NOT EXISTS idx_schedules_instrument ON public."maintenanceSchedules"("instrumentId");
CREATE INDEX IF NOT EXISTS idx_schedules_status ON public."maintenanceSchedules"(status);

ALTER TABLE public."maintenanceSchedules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public."maintenanceSchedules" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- MAINTENANCE RESULTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public."maintenanceResults" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "maintenanceScheduleId" uuid REFERENCES public."maintenanceSchedules"(id) ON DELETE CASCADE,
  "instrumentId" uuid REFERENCES public.instruments(id) ON DELETE CASCADE,
  "completedDate" timestamp with time zone NOT NULL,
  "resultType" text NOT NULL,
  notes text,
  "documentUrl" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "testData" jsonb,
  "templateId" uuid REFERENCES public."testTemplates"(id) ON DELETE SET NULL,
  user_id uuid
);

ALTER TABLE public."maintenanceResults" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public."maintenanceResults" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- MAINTENANCE DOCUMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id uuid REFERENCES public.instruments(id) ON DELETE CASCADE,
  maintenance_schedule_id uuid REFERENCES public."maintenanceSchedules"(id) ON DELETE CASCADE,
  title text,
  description text,
  document_url text,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  document_type text DEFAULT 'main' CHECK (document_type = ANY (ARRAY['main', 'section', 'other'])),
  section_id text
);

ALTER TABLE public.maintenance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public.maintenance_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- DONE
-- ============================================================================
SELECT 'Plan-PM database initialized successfully!' as status;
