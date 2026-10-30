-- ============================================================
-- RoadGuard — Migration 004: Pagination & Performance Helpers
-- ============================================================
-- Apply via: supabase db push
-- Or in Supabase Studio SQL Editor.
-- ============================================================

-- ============================================================
-- Additional composite indexes for pagination performance
-- ============================================================

-- Composite index for the most common admin query:
-- ORDER BY created_at DESC with status filter
CREATE INDEX IF NOT EXISTS idx_complaints_status_created
  ON public.complaints(complaint_status, created_at DESC);

-- Composite index for reporter's own complaints in reverse chron order
-- (already partially covered by idx_complaints_reporter, but explicit here)
CREATE INDEX IF NOT EXISTS idx_complaints_reporter_created
  ON public.complaints(reporter_id, created_at DESC);

-- Assigned admin complaints index
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_status
  ON public.complaints(assigned_to, complaint_status)
  WHERE assigned_to IS NOT NULL;

-- Timestamp range queries for analytics
CREATE INDEX IF NOT EXISTS idx_complaints_created_at
  ON public.complaints(created_at DESC);

-- Resolved complaints for resolution time analytics
CREATE INDEX IF NOT EXISTS idx_complaints_resolved_at
  ON public.complaints(resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

-- ============================================================
-- Server-side paginated complaint listing function
-- Used by the admin dashboard and potentially mobile list screens
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_complaints_page(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_damage_type TEXT DEFAULT NULL,
  p_order_by TEXT DEFAULT 'created_at',
  p_ascending BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  reporter_id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address_label TEXT,
  damage_type TEXT,
  detection_confidence REAL,
  verification_status TEXT,
  complaint_status TEXT,
  duplicate_of UUID,
  assigned_to UUID,
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate page size to prevent abuse
  IF p_page_size > 100 THEN
    p_page_size := 100;
  END IF;
  IF p_page_size < 1 THEN
    p_page_size := 25;
  END IF;
  IF p_page < 1 THEN
    p_page := 1;
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Get total count matching filters
  SELECT COUNT(*) INTO v_total
  FROM public.complaints c
  WHERE
    (p_status IS NULL OR c.complaint_status = p_status)
    AND (p_damage_type IS NULL OR c.damage_type = p_damage_type)
    AND (
      p_search IS NULL
      OR c.id::text ILIKE '%' || p_search || '%'
      OR c.address_label ILIKE '%' || p_search || '%'
      OR c.damage_type ILIKE '%' || p_search || '%'
    )
    AND (
      -- Non-admins only see non-rejected or own complaints
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
      OR c.complaint_status != 'rejected'
      OR c.reporter_id = auth.uid()
    );

  RETURN QUERY
  SELECT
    c.id,
    c.reporter_id,
    c.latitude,
    c.longitude,
    c.address_label,
    c.damage_type,
    c.detection_confidence,
    c.verification_status,
    c.complaint_status,
    c.duplicate_of,
    c.assigned_to,
    c.description,
    c.created_at,
    c.updated_at,
    c.resolved_at,
    v_total AS total_count
  FROM public.complaints c
  WHERE
    (p_status IS NULL OR c.complaint_status = p_status)
    AND (p_damage_type IS NULL OR c.damage_type = p_damage_type)
    AND (
      p_search IS NULL
      OR c.id::text ILIKE '%' || p_search || '%'
      OR c.address_label ILIKE '%' || p_search || '%'
      OR c.damage_type ILIKE '%' || p_search || '%'
    )
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
      OR c.complaint_status != 'rejected'
      OR c.reporter_id = auth.uid()
    )
  ORDER BY
    CASE WHEN p_order_by = 'created_at' AND p_ascending THEN c.created_at END ASC,
    CASE WHEN p_order_by = 'created_at' AND NOT p_ascending THEN c.created_at END DESC,
    CASE WHEN p_order_by = 'updated_at' AND p_ascending THEN c.updated_at END ASC,
    CASE WHEN p_order_by = 'updated_at' AND NOT p_ascending THEN c.updated_at END DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- ============================================================
-- User-specific paginated complaints (for mobile reports screen)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_complaints_page(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address_label TEXT,
  damage_type TEXT,
  detection_confidence REAL,
  verification_status TEXT,
  complaint_status TEXT,
  duplicate_of UUID,
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_page_size > 50 THEN p_page_size := 50; END IF;
  IF p_page_size < 1 THEN p_page_size := 20; END IF;
  IF p_page < 1 THEN p_page := 1; END IF;

  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM public.complaints c
  WHERE
    c.reporter_id = auth.uid()
    AND (p_status IS NULL OR c.complaint_status = p_status);

  RETURN QUERY
  SELECT
    c.id,
    c.latitude,
    c.longitude,
    c.address_label,
    c.damage_type,
    c.detection_confidence,
    c.verification_status,
    c.complaint_status,
    c.duplicate_of,
    c.description,
    c.created_at,
    c.updated_at,
    c.resolved_at,
    v_total AS total_count
  FROM public.complaints c
  WHERE
    c.reporter_id = auth.uid()
    AND (p_status IS NULL OR c.complaint_status = p_status)
  ORDER BY c.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- ============================================================
-- Map complaints function — returns complaints within a
-- bounding box for efficient map rendering (avoids loading all)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_map_complaints(
  p_lat_min DOUBLE PRECISION,
  p_lat_max DOUBLE PRECISION,
  p_lon_min DOUBLE PRECISION,
  p_lon_max DOUBLE PRECISION,
  p_max_results INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  damage_type TEXT,
  complaint_status TEXT,
  address_label TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate bounds to prevent full-table scans
  IF (p_lat_max - p_lat_min) > 1.0 OR (p_lon_max - p_lon_min) > 1.0 THEN
    RAISE EXCEPTION 'Bounding box too large (max 1 degree)';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.latitude,
    c.longitude,
    c.damage_type,
    c.complaint_status,
    c.address_label,
    c.created_at
  FROM public.complaints c
  WHERE
    c.latitude BETWEEN p_lat_min AND p_lat_max
    AND c.longitude BETWEEN p_lon_min AND p_lon_max
    AND c.complaint_status NOT IN ('rejected')
  ORDER BY c.created_at DESC
  LIMIT p_max_results;
END;
$$;

-- ============================================================
-- Enhanced analytics function with time-based filters
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_complaint_stats(
  p_days INTEGER DEFAULT NULL  -- NULL = all time, otherwise last N days
)
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
  FROM public.complaints
  WHERE
    p_days IS NULL
    OR created_at >= NOW() - make_interval(days => p_days);
$$;
