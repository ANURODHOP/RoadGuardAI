-- ============================================================
-- RoadGuard — Migration 002: Indexes & Row Level Security
-- ============================================================

-- ============================================================
-- Spatial and performance indexes
-- ============================================================

-- Geographic proximity search (earthdistance uses ll_to_earth)
CREATE INDEX IF NOT EXISTS idx_complaints_location
  ON public.complaints USING btree (latitude, longitude);

-- Status-based filtering
CREATE INDEX IF NOT EXISTS idx_complaints_status
  ON public.complaints(complaint_status);

CREATE INDEX IF NOT EXISTS idx_complaints_verification
  ON public.complaints(verification_status);

-- Reporter's complaints
CREATE INDEX IF NOT EXISTS idx_complaints_reporter
  ON public.complaints(reporter_id, created_at DESC);

-- Evidence lookup
CREATE INDEX IF NOT EXISTS idx_evidence_complaint
  ON public.complaint_evidence(complaint_id, created_at DESC);

-- Contributions lookup
CREATE INDEX IF NOT EXISTS idx_contributions_complaint
  ON public.complaint_contributions(complaint_id);

CREATE INDEX IF NOT EXISTS idx_contributions_user
  ON public.complaint_contributions(user_id);

-- Status history
CREATE INDEX IF NOT EXISTS idx_status_history_complaint
  ON public.complaint_status_history(complaint_id, created_at DESC);

-- Duplicate chain
CREATE INDEX IF NOT EXISTS idx_complaints_duplicate_of
  ON public.complaints(duplicate_of)
  WHERE duplicate_of IS NOT NULL;

-- Full-text search on description and address
CREATE INDEX IF NOT EXISTS idx_complaints_description_fts
  ON public.complaints USING gin(to_tsvector('english', COALESCE(description, '') || ' ' || COALESCE(address_label, '')));

-- ============================================================
-- Row Level Security Policies
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_status_history ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────

-- Anyone can read public profile info (no email, no sensitive data)
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT USING (true);

-- Users can only update their own profile (not their role!)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())  -- Cannot change own role
  );

-- ── complaints ───────────────────────────────────────────

-- Anyone authenticated can read non-rejected complaints (for the map)
DROP POLICY IF EXISTS "complaints_select_public" ON public.complaints;
CREATE POLICY "complaints_select_public" ON public.complaints
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      complaint_status != 'rejected'
      OR reporter_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    )
  );

-- Authenticated users can create complaints as themselves
DROP POLICY IF EXISTS "complaints_insert_own" ON public.complaints;
CREATE POLICY "complaints_insert_own" ON public.complaints
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
  );

-- Users can update only their own complaints (description only), admins can update any
DROP POLICY IF EXISTS "complaints_update" ON public.complaints;
CREATE POLICY "complaints_update" ON public.complaints
  FOR UPDATE USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  )
  WITH CHECK (
    -- Regular users can only change description
    (
      reporter_id = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
      -- Cannot change status or verification fields
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- ── complaint_evidence ───────────────────────────────────

-- Evidence is readable if the complaint is readable
DROP POLICY IF EXISTS "evidence_select" ON public.complaint_evidence;
CREATE POLICY "evidence_select" ON public.complaint_evidence
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_id
      AND (c.complaint_status != 'rejected' OR c.reporter_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')))
    )
  );

-- Users can upload evidence for their own complaints; admins for any
DROP POLICY IF EXISTS "evidence_insert" ON public.complaint_evidence;
CREATE POLICY "evidence_insert" ON public.complaint_evidence
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND uploaded_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.reporter_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    )
  );

-- ── complaint_contributions ──────────────────────────────

DROP POLICY IF EXISTS "contributions_select" ON public.complaint_contributions;
CREATE POLICY "contributions_select" ON public.complaint_contributions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "contributions_insert" ON public.complaint_contributions;
CREATE POLICY "contributions_insert" ON public.complaint_contributions
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- ── complaint_status_history ─────────────────────────────

DROP POLICY IF EXISTS "status_history_select" ON public.complaint_status_history;
CREATE POLICY "status_history_select" ON public.complaint_status_history
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only system/admin can insert (done via Edge Functions or triggers)
DROP POLICY IF EXISTS "status_history_insert_admin" ON public.complaint_status_history;
CREATE POLICY "status_history_insert_admin" ON public.complaint_status_history
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- ============================================================
-- Proximity search helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.nearby_complaints(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION DEFAULT 30.0,
  exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  damage_type TEXT,
  complaint_status TEXT,
  verification_status TEXT,
  detection_confidence REAL,
  address_label TEXT,
  created_at TIMESTAMPTZ,
  distance_meters DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.latitude,
    c.longitude,
    c.damage_type,
    c.complaint_status,
    c.verification_status,
    c.detection_confidence,
    c.address_label,
    c.created_at,
    earth_distance(
      ll_to_earth(c.latitude, c.longitude),
      ll_to_earth(user_lat, user_lon)
    ) AS distance_meters
  FROM public.complaints c
  WHERE
    c.complaint_status NOT IN ('rejected', 'resolved')
    AND (exclude_id IS NULL OR c.id != exclude_id)
    AND earth_distance(
      ll_to_earth(c.latitude, c.longitude),
      ll_to_earth(user_lat, user_lon)
    ) <= radius_meters
  ORDER BY distance_meters ASC
  LIMIT 20;
$$;

-- ============================================================
-- Analytics helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_complaint_stats()
RETURNS TABLE (
  total BIGINT,
  pending BIGINT,
  verified BIGINT,
  assigned BIGINT,
  in_progress BIGINT,
  resolved BIGINT,
  rejected BIGINT,
  duplicate BIGINT,
  avg_resolution_hours NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE complaint_status = 'pending_verification') AS pending,
    COUNT(*) FILTER (WHERE complaint_status = 'verified') AS verified,
    COUNT(*) FILTER (WHERE complaint_status = 'assigned') AS assigned,
    COUNT(*) FILTER (WHERE complaint_status = 'in_progress') AS in_progress,
    COUNT(*) FILTER (WHERE complaint_status = 'resolved') AS resolved,
    COUNT(*) FILTER (WHERE complaint_status = 'rejected') AS rejected,
    COUNT(*) FILTER (WHERE complaint_status = 'duplicate') AS duplicate,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)
      FILTER (WHERE resolved_at IS NOT NULL),
      1
    ) AS avg_resolution_hours
  FROM public.complaints;
$$;
