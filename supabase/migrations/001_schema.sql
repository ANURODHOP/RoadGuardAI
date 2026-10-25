-- ============================================================
-- RoadGuard — Migration 001: Core Schema
-- ============================================================
-- Apply this migration via:
--   supabase db push
-- Or in Supabase Studio SQL editor.
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "earthdistance";

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT       NOT NULL DEFAULT '',
  role        TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  avatar_url  TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- complaints
-- ============================================================
CREATE TABLE IF NOT EXISTS public.complaints (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Location
  latitude             DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude            DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location_accuracy_m  REAL,
  address_label        TEXT,
  
  -- Detection
  damage_type          TEXT        NOT NULL DEFAULT 'pothole' CHECK (damage_type IN ('pothole', 'crack', 'subsidence', 'other')),
  detection_confidence REAL        CHECK (detection_confidence BETWEEN 0 AND 1),
  
  -- Status
  verification_status  TEXT        NOT NULL DEFAULT 'pending_verification'
                        CHECK (verification_status IN ('pending_verification', 'verified', 'rejected', 'uncertain')),
  complaint_status     TEXT        NOT NULL DEFAULT 'pending_verification'
                        CHECK (complaint_status IN (
                          'pending_verification', 'verified', 'assigned',
                          'in_progress', 'resolved', 'rejected', 'duplicate'
                        )),
  
  -- Relations
  duplicate_of         UUID        REFERENCES public.complaints(id) ON DELETE SET NULL,
  assigned_to          UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Text fields
  description          TEXT,
  rejection_reason     TEXT,
  resolution_note      TEXT,
  
  -- Timestamps
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- complaint_evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.complaint_evidence (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID        NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  uploaded_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_path TEXT        NOT NULL,
  evidence_type TEXT       NOT NULL DEFAULT 'photo'
                CHECK (evidence_type IN ('photo', 'repair_photo', 'street_view', 'annotation')),
  source       TEXT        NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'admin', 'system', 'street_view')),
  mime_type    TEXT        NOT NULL DEFAULT 'image/jpeg',
  width_px     INTEGER,
  height_px    INTEGER,
  file_size_bytes BIGINT,
  captured_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- complaint_contributions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.complaint_contributions (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id      UUID        NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contribution_type TEXT        NOT NULL
                    CHECK (contribution_type IN ('confirmation', 'supporting_evidence', 'original_report', 'resolution_evidence')),
  evidence_id       UUID        REFERENCES public.complaint_evidence(id) ON DELETE SET NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate contributions from the same user (same type) on the same complaint
CREATE UNIQUE INDEX IF NOT EXISTS idx_contributions_unique_confirm
  ON public.complaint_contributions(complaint_id, user_id, contribution_type)
  WHERE contribution_type = 'confirmation';

-- ============================================================
-- complaint_status_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.complaint_status_history (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID        NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  changed_by   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_status   TEXT,
  new_status   TEXT        NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_complaints_updated_at ON public.complaints;
CREATE TRIGGER set_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Status transition validation
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  allowed_transitions TEXT[] := ARRAY[
    'pending_verification->verified',
    'pending_verification->rejected',
    'pending_verification->duplicate',
    'verified->assigned',
    'verified->rejected',
    'assigned->in_progress',
    'assigned->rejected',
    'in_progress->resolved',
    'in_progress->assigned',
    'resolved->resolved',  -- Allow re-resolving with new evidence
    'duplicate->pending_verification'  -- Allow un-duplicating
  ];
  transition TEXT;
BEGIN
  IF OLD.complaint_status = NEW.complaint_status THEN
    RETURN NEW;
  END IF;
  
  transition := OLD.complaint_status || '->' || NEW.complaint_status;
  
  IF NOT (transition = ANY(allowed_transitions)) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.complaint_status, NEW.complaint_status;
  END IF;
  
  -- Auto-set resolved_at
  IF NEW.complaint_status = 'resolved' THEN
    NEW.resolved_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_complaint_status ON public.complaints;
CREATE TRIGGER validate_complaint_status
  BEFORE UPDATE OF complaint_status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.validate_status_transition();

-- ============================================================
-- Auto-record status history
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.complaint_status != NEW.complaint_status THEN
    INSERT INTO public.complaint_status_history (complaint_id, old_status, new_status)
    VALUES (NEW.id, OLD.complaint_status, NEW.complaint_status);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_record_status_history ON public.complaints;
CREATE TRIGGER auto_record_status_history
  AFTER UPDATE OF complaint_status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.record_status_change();
