/**
 * Setup Admin User Script
 * Creates or resets admin user in Supabase Auth
 * 
 * Run with: 
 * SUPABASE_SERVICE_ROLE_KEY="your-key" node scripts/setup-admin-user.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xkrtqijtwpkgmystacvt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Admin user details
const ADMIN_EMAIL = 'admin@wancom.pk';
const ADMIN_PASSWORD = '@dmin123456';

async function createOrResetAdmin() {
  console.log('🔐 WANCOM Admin User Setup Script');
  console.log('==================================\n');
  
  // First, list all users to check if admin exists
  console.log('🔍 Checking existing users...');
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ Error listing users:', listError.message);
    process.exit(1);
  }
  
  console.log(`   Found ${users.length} existing users`);
  users.forEach(u => console.log(`   - ${u.email} (${u.id})`));
  
  const existingUser = users.find(u => u.email === ADMIN_EMAIL);
  
  if (existingUser) {
    console.log(`\n📝 Admin user exists (${existingUser.id}), updating password and metadata...`);
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: ADMIN_PASSWORD,
      user_metadata: {
        role: 'admin',
        full_name: 'System Administrator'
      }
    });
    
    if (error) {
      console.error('❌ Error updating user:', error.message);
      process.exit(1);
    }
    console.log('✅ Admin user updated successfully!');
  } else {
    console.log('\n➕ Creating new admin user...');
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        full_name: 'System Administrator'
      }
    });
    
    if (error) {
      console.error('❌ Error creating user:', error.message);
      process.exit(1);
    }
    console.log('✅ Admin user created successfully!');
    console.log('   User ID:', data.user.id);
  }
  
  console.log('\n✨ Done! You can now login at /admin/login with:');
  console.log('   Email:', ADMIN_EMAIL);
  console.log('   Password:', ADMIN_PASSWORD);
}

createOrResetAdmin().catch(err => {
  console.error('❌ Script failed:', err.message);
  process.exit(1);
});
