const { createClient } = require('./apps/admin/node_modules/@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const email = process.argv[2] || 'admin@roadguard.ai';
  const password = process.argv[3] || 'Admin@123456';
  const displayName = 'RoadGuard Admin';

  console.log(`Checking / creating admin account for: ${email}`);

  // Check if user already exists
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users:', listError.message);
    return;
  }

  let user = users.find(u => u.email === email);

  if (!user) {
    console.log('User not found. Creating new user in auth.users...');
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName }
    });

    if (createError) {
      console.error('Error creating user:', createError.message);
      return;
    }
    user = created.user;
    console.log('User created with ID:', user.id);
  } else {
    console.log('User already exists with ID:', user.id);
    // Update password
    await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    console.log('Password updated.');
  }

  // Ensure profile exists and has role = 'admin'
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    console.log('Inserting profile record with role admin...');
    const { error: insErr } = await supabase.from('profiles').insert({
      id: user.id,
      display_name: displayName,
      role: 'admin'
    });
    if (insErr) console.error('Error inserting profile:', insErr.message);
    else console.log('Profile created successfully with role = admin.');
  } else {
    console.log('Updating existing profile role to admin...');
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ role: 'admin', display_name: displayName })
      .eq('id', user.id);
    if (updErr) console.error('Error updating profile:', updErr.message);
    else console.log('Profile updated successfully to role = admin.');
  }

  console.log('\n=======================================');
  console.log('ADMIN ACCOUNT READY:');
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('Portal:   http://localhost:3000');
  console.log('=======================================\n');
}

main().catch(console.error);
