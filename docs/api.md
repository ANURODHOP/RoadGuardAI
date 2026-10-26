# API & Edge Functions Specification

## Overview

RoadGuard follows a secure API design where client applications (Mobile and Admin Web) interact with Supabase via authenticated client libraries, with privileged mutations delegated to a secure Supabase Edge Function.

---

## Privileged Endpoint: `admin-action` Edge Function

- **URL**: `POST ${SUPABASE_URL}/functions/v1/admin-action`
- **Auth**: Bearer token (JWT of an administrator or moderator)
- **Purpose**: Ensures that complaint status transitions are performed only by authorized personnel and creates an immutable status audit trail.

### Request Body Schema

```json
{
  "action": "verify" | "update_status" | "reject" | "resolve" | "mark_duplicate",
  "complaint_id": "c1f77d54-1b4d-44ea-831d-b8d96e4763fa",
  "new_status": "assigned" | "in_progress" | "resolved",
  "note": "Optional operational note",
  "rejection_reason": "Required when action is 'reject'",
  "resolution_note": "Required when action is 'resolve'",
  "duplicate_of": "Required UUID when action is 'mark_duplicate'"
}
```

### Response Schema

```json
{
  "success": true,
  "complaint": {
    "id": "c1f77d54-1b4d-44ea-831d-b8d96e4763fa",
    "complaint_status": "verified",
    "verification_status": "manual_inspection"
  }
}
```

---

## Database RPCs

### 1. `nearby_complaints(lat, lon, radius_meters)`
- **Parameters**:
  - `lat` (float): Latitude of the candidate damage.
  - `lon` (float): Longitude of the candidate damage.
  - `radius_meters` (float, default: 30.0): Search radius in meters.
- **Returns**: Active (unresolved) reports within radius, ordered by distance ascending.

### 2. `get_complaint_stats()`
- **Parameters**: None.
- **Returns**: Aggregated counts across statuses (`total`, `pending`, `verified`, `assigned`, `in_progress`, `resolved`, `rejected`, `duplicate`, `avg_resolution_hours`).

---

## Storage Buckets

1. **`evidence`**:
   - Access: Private (signed URL generation required).
   - Retention: Permanent or until ticket archival.
   - Purpose: Original citizen photographs submitted during detection and evidence capture.
2. **`repair-photos`**:
   - Access: Authenticated read/write for municipal contractors and field teams.
   - Purpose: Proof of work and completed asphalt repair photographs.
