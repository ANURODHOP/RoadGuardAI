/**
 * RoadGuard — Security Integration Tests
 *
 * Verifies RLS policies, role protection, and input validation
 * using the Supabase JavaScript client.
 *
 * HOW TO RUN:
 *   Set env vars then: npx ts-node --esm tests/security.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL             = process.env.SUPABASE_URL             ?? ''
const SUPABASE_ANON_KEY        = process.env.SUPABASE_ANON_KEY        ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
let passCount = 0, failCount = 0
const failures: string[] = []

function assert(condition: boolean, message: string): void {
  if (condition) { console.log(`  ✅ ${message}`); passCount++ }
  else { console.error(`  ❌ FAIL: ${message}`); failCount++; failures.push(message) }
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anonClient  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_TAG = `sec_${Date.now()}`
const cleanupIds: string[] = []
const cleanupUsers: string[] = []

async function makeUser(suffix: string): Promise<{ id: string; client: SupabaseClient }> {
  const email    = `roadguard_${TEST_TAG}_${suffix}@test-noreply.invalid`
  const password = `Sec@${Date.now()}Rg!`
  const { data, error } = await adminClient.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: `Sec Test ${suffix}` },
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  cleanupUsers.push(data.user.id)
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await client.auth.signInWithPassword({ email, password })
  return { id: data.user.id, client }
}

async function cleanup() {
  if (cleanupIds.length) await adminClient.from('complaints').delete().in('id', cleanupIds)
  for (const uid of cleanupUsers) await adminClient.auth.admin.deleteUser(uid)
}

// ── Security Tests ────────────────────────────────────────────────────────────

async function testUnauthenticatedAccess(): Promise<void> {
  console.log('\n🔑 Test: Unauthenticated access')

  // Cannot read complaints without auth
  const { data, error } = await anonClient.from('complaints').select('id').limit(1)
  assert(!!error || (Array.isArray(data) && data.length === 0),
    'Unauthenticated users cannot read complaints (RLS enforced)')

  // Cannot read profiles without auth
  const { data: pData, error: pErr } = await anonClient.from('profiles').select('id').limit(1)
  assert(!!pErr || (Array.isArray(pData) && pData.length === 0),
    'Unauthenticated users cannot read profiles (RLS enforced)')

  // Cannot call nearby_complaints
  const { error: rpcErr } = await anonClient.rpc('nearby_complaints', {
    user_lat: 28.6, user_lon: 77.2, radius_meters: 30, exclude_id: null,
  })
  assert(!!rpcErr, 'nearby_complaints() rejects unauthenticated callers')

  // Cannot insert complaints
  const { error: insertErr } = await anonClient.from('complaints').insert({
    reporter_id: '00000000-0000-0000-0000-000000000000',
    latitude: 28.6, longitude: 77.2,
    damage_type: 'pothole',
    verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
  })
  assert(!!insertErr, 'Unauthenticated users cannot insert complaints')
}

async function testStatusHistoryProtection(): Promise<void> {
  console.log('\n📜 Test: Status history write protection')

  const { id, client } = await makeUser('sh')

  // Create a complaint to reference
  const { data: c } = await client.from('complaints').insert({
    reporter_id: id, latitude: 28.62, longitude: 77.21,
    damage_type: 'pothole', verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
    description: `SH test (${TEST_TAG})`,
  }).select('id').single()
  if (c) cleanupIds.push(c.id)

  // Regular user cannot directly insert into status_history
  const { error: histErr } = await client.from('complaint_status_history').insert({
    complaint_id: c?.id, changed_by: id,
    old_status: 'pending_verification', new_status: 'resolved',
    note: 'Injected by test',
  })
  assert(!!histErr, 'Regular user cannot directly insert into complaint_status_history')
}

async function testEvidenceProtection(): Promise<void> {
  console.log('\n🖼️  Test: Evidence upload protection')

  const { id: idA, client: clientA } = await makeUser('ev_a')
  const { id: idB, client: clientB } = await makeUser('ev_b')

  // User A creates a complaint
  const { data: c } = await clientA.from('complaints').insert({
    reporter_id: idA, latitude: 28.63, longitude: 77.22,
    damage_type: 'crack', verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
    description: `Evidence test (${TEST_TAG})`,
  }).select('id').single()
  if (c) cleanupIds.push(c.id)

  // User B cannot insert evidence with uploaded_by = User A (spoof)
  const { error: spoofErr } = await clientB.from('complaint_evidence').insert({
    complaint_id:  c?.id,
    uploaded_by:   idA,          // spoofing User A's ID
    storage_path:  'test/fake.jpg',
    evidence_type: 'photo',
    source:        'user',
    mime_type:     'image/jpeg',
  })
  assert(!!spoofErr, 'User B cannot upload evidence as User A (uploaded_by RLS check)')

  // User B CAN upload evidence to User A's complaint as themselves (supporter)
  const { error: supportErr } = await clientB.from('complaint_evidence').insert({
    complaint_id:  c?.id,
    uploaded_by:   idB,          // correctly User B
    storage_path:  'test/support_b.jpg',
    evidence_type: 'photo',
    source:        'user',
    mime_type:     'image/jpeg',
  })
  assert(!supportErr, 'User B can add supporting evidence to User A\'s complaint as themselves')
}

async function testCoordinateValidation(): Promise<void> {
  console.log('\n📍 Test: Coordinate constraint validation')

  const { id, client } = await makeUser('coord')

  // Invalid latitude (> 90)
  const { error: latErr } = await client.from('complaints').insert({
    reporter_id: id, latitude: 91.0, longitude: 77.0,
    damage_type: 'pothole', verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
  })
  assert(!!latErr, 'Invalid latitude (> 90) is rejected by DB CHECK constraint')

  // Invalid longitude (< -180)
  const { error: lonErr } = await client.from('complaints').insert({
    reporter_id: id, latitude: 28.0, longitude: -181.0,
    damage_type: 'pothole', verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
  })
  assert(!!lonErr, 'Invalid longitude (< -180) is rejected by DB CHECK constraint')

  // Invalid damage_type
  const { error: typeErr } = await client.from('complaints').insert({
    reporter_id: id, latitude: 28.0, longitude: 77.0,
    damage_type: 'explosion',  // not in CHECK constraint
    verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
  })
  assert(!!typeErr, 'Invalid damage_type rejected by DB CHECK constraint')
}

async function testStatusTransitionValidation(): Promise<void> {
  console.log('\n🔄 Test: Status transition validation (DB trigger)')

  // Use admin client to bypass RLS for status updates (testing trigger only)
  const { id } = await makeUser('trans')
  const { data: c } = await adminClient.from('complaints').insert({
    reporter_id: id, latitude: 28.64, longitude: 77.23,
    damage_type: 'pothole', verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
    description: `Transition test (${TEST_TAG})`,
  }).select('id').single()
  if (c) cleanupIds.push(c.id)

  // Invalid direct jump: pending_verification → resolved (skips required steps)
  const { error: jumpErr } = await adminClient
    .from('complaints')
    .update({ complaint_status: 'resolved' })
    .eq('id', c?.id ?? '')

  assert(!!jumpErr, 'Invalid status jump (pending → resolved) rejected by DB trigger')

  // Valid transition: pending_verification → verified
  const { error: validErr } = await adminClient
    .from('complaints')
    .update({ complaint_status: 'verified' })
    .eq('id', c?.id ?? '')

  assert(!validErr, 'Valid status transition (pending → verified) succeeds')
}

async function testConfidenceConstraint(): Promise<void> {
  console.log('\n📊 Test: Detection confidence constraint')

  const { id, client } = await makeUser('conf')

  // Confidence > 1.0 should be rejected
  const { error: highErr } = await client.from('complaints').insert({
    reporter_id: id, latitude: 28.65, longitude: 77.24,
    damage_type: 'pothole', verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
    detection_confidence: 1.5,  // > 1.0, violates CHECK constraint
  })
  assert(!!highErr, 'Detection confidence > 1.0 rejected by DB CHECK constraint')

  // Confidence < 0.0 should be rejected
  const { error: lowErr } = await client.from('complaints').insert({
    reporter_id: id, latitude: 28.65, longitude: 77.24,
    damage_type: 'pothole', verification_status: 'pending_verification',
    complaint_status: 'pending_verification',
    detection_confidence: -0.1,  // < 0.0, violates CHECK constraint
  })
  assert(!!lowErr, 'Detection confidence < 0.0 rejected by DB CHECK constraint')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🛡️  RoadGuard Security Integration Tests')
  console.log(`   Tag: ${TEST_TAG}`)
  console.log('─'.repeat(60))

  try {
    await testUnauthenticatedAccess()
    await testStatusHistoryProtection()
    await testEvidenceProtection()
    await testCoordinateValidation()
    await testStatusTransitionValidation()
    await testConfidenceConstraint()
  } catch (err: any) {
    console.error('\n💥 Unexpected error:', err.message)
    failCount++
    failures.push(`Unexpected: ${err.message}`)
  } finally {
    console.log('\n🧹 Cleaning up...')
    await cleanup()
  }

  console.log('\n' + '─'.repeat(60))
  console.log(`📊 Results: ${passCount} passed, ${failCount} failed`)
  if (failures.length > 0) {
    console.error('\nFailed assertions:')
    failures.forEach(f => console.error(`  ❌ ${f}`))
  }
  console.log('─'.repeat(60))
  process.exit(failCount > 0 ? 1 : 0)
}

main()
