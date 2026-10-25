-- ============================================================
-- RoadGuard — Seed: Admin Account Setup
-- ============================================================
-- Run this AFTER a user has registered through the normal
-- sign-up flow with the email you want to make admin.
--
-- Replace 'admin@example.com' with the actual admin email.
-- Run this in Supabase Studio → SQL Editor with the service role.
-- ============================================================

-- Grant admin role to a specific user by email
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
);

-- Verify the update
SELECT p.id, p.display_name, p.role, u.email
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.role = 'admin';
