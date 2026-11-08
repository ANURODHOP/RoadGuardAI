-- ============================================================
-- RoadGuard — Migration 006: Security Hardening
-- ============================================================
-- Apply via Supabase Studio SQL Editor (run as service role).
-- ============================================================

-- ============================================================
-- FIX 1: Profiles — block unauthenticated reads
-- The original policy had no auth check, allowing anon reads.
-- ============================================================

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;

-- Only authenticated users can read profiles (their own or others for display)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- FIX 2: Status transition trigger — ensure it's installed
-- The validate_status_transition trigger must exist in the DB.
-- This recreates it safely if it was missing.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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
    'resolved->resolved',
    'duplicate->pending_verification'
  ];
  transition TEXT;
BEGIN
  IF OLD.complaint_status = NEW.complaint_status THEN
    RETURN NEW;
  END IF;

  transition := OLD.complaint_status || '->' || NEW.complaint_status;

  IF NOT (transition = ANY(allowed_transitions)) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %',
      OLD.complaint_status, NEW.complaint_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-set resolved_at when resolved
  IF NEW.complaint_status = 'resolved' THEN
    NEW.resolved_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger is attached (drop + recreate = idempotent)
DROP TRIGGER IF EXISTS validate_complaint_status ON public.complaints;
CREATE TRIGGER validate_complaint_status
  BEFORE UPDATE OF complaint_status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.validate_status_transition();

-- ============================================================
-- FIX 3: auto_record_status_history trigger
-- Recreate as SECURITY DEFINER so it can write to status_history
-- regardless of the caller's role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_status_change()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.complaint_status != NEW.complaint_status THEN
    INSERT INTO public.complaint_status_history (
      complaint_id,
      changed_by,
      old_status,
      new_status
    ) VALUES (
      NEW.id,
      auth.uid(),
      OLD.complaint_status,
      NEW.complaint_status
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_record_status_history ON public.complaints;
CREATE TRIGGER auto_record_status_history
  AFTER UPDATE OF complaint_status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.record_status_change();
