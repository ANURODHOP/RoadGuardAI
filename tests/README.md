# RoadGuard — Integration Tests

## Overview

This directory contains integration tests that run against a **live Supabase project**.  
Tests verify multi-user isolation, security policies (RLS), and the YOLO inference pipeline.

> **⚠️ Warning**: These tests create and delete real database rows in your Supabase project.  
> Never run against a production database with real complaint data.

---

## Tests

| File | Coverage |
|---|---|
| `multi-user.test.ts` | User isolation, concurrent submission, pagination, contributions, auth guards |
| `security.test.ts` | Unauthenticated access, role escalation, evidence spoofing, DB constraints |

---

## Prerequisites

### 1. Install test dependencies

```powershell
cd tests
npm install
```

### 2. Set environment variables

**PowerShell:**
```powershell
$env:SUPABASE_URL              = "https://kvuxdgrrhranczidpowf.supabase.co"
$env:SUPABASE_ANON_KEY         = "<your anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<your service role key>"
```

**Or create a `.env.test` file (never commit this):**
```
SUPABASE_URL=https://kvuxdgrrhranczidpowf.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Running Tests

```powershell
# From the tests/ directory:
cd "c:\IMP\Big potato project\Road Guard AI\tests"

# Run multi-user isolation tests
npx ts-node --esm multi-user.test.ts

# Run security / RLS tests
npx ts-node --esm security.test.ts

# Run all
npm run test:all
```

---

## Expected Output

```
🧪 RoadGuard Multi-User Integration Tests
   Tag: test_1733123456789
   URL: https://kvuxdgrrhranczidpowf.supabase.co
────────────────────────────────────────────────────────────

👤 Setting up test users...
   Created users: roadguard_test_..._A@..., ...

📋 Test: User data isolation
  ✅ User A can create a complaint as themselves
  ✅ User A cannot create a complaint as User B (RLS blocks reporter_id spoof)
  ✅ User B can read User A's non-rejected complaint (public data)
  ✅ reporter_id visible in public data
  ✅ User B cannot update User A's complaint (RLS blocks)
  ✅ User A can update their own complaint description

[... more tests ...]

🧹 Cleaning up test data...
   Deleted 15 complaints, 3 users

────────────────────────────────────────────────────────────
📊 Results: 28 passed, 0 failed
────────────────────────────────────────────────────────────
```

---

## What Each Test Verifies

### `multi-user.test.ts`

| Test | What It Proves |
|---|---|
| User isolation | User A cannot create complaints as User B; each user's data is isolated |
| Status update auth | Regular users cannot change complaint status; trigger enforces column restriction |
| Community contributions | Any authenticated user can confirm others' complaints; duplicates blocked |
| Concurrent submission | Simultaneous submissions create distinct records with unique IDs |
| Pagination | `get_my_complaints_page()` returns correct pages with no overlap |
| Role protection | Regular users cannot escalate their own role to admin |
| Nearby complaints auth | `nearby_complaints()` requires a valid auth session |

### `security.test.ts`

| Test | What It Proves |
|---|---|
| Unauthenticated access | Anon users cannot read complaints, profiles, or call RPCs |
| Status history protection | Direct status_history INSERT blocked for regular users |
| Evidence protection | Cannot upload evidence with spoofed `uploaded_by`; supporters can upload as themselves |
| Coordinate validation | DB CHECK constraints reject invalid lat/lon and damage_type |
| Status transition trigger | Invalid status jumps (pending → resolved) rejected by DB trigger |
| Confidence constraint | Detection confidence outside [0, 1] rejected by DB CHECK |

---

## Cleanup Guarantee

Each test run:
1. Creates test users with unique email addresses (`roadguard_{timestamp}_{suffix}@test-noreply.invalid`)
2. All test complaints are tracked in `testComplaintIds`
3. `finally` block always runs cleanup, even if tests fail
4. Test users are deleted via service role after each run

If a test run is interrupted, re-run it — the next run will create new users and complaints, and clean those up.
To manually clean up orphaned test data:

```sql
-- Run in Supabase SQL Editor
DELETE FROM public.complaints
WHERE description LIKE '%test_%@test-noreply%'
   OR description LIKE 'test_%';

DELETE FROM auth.users
WHERE email LIKE '%@test-noreply.invalid';
```
