/**
 * Reset Admin Password Script
 * Run with: node scripts/reset-admin-password.js
 */

const { createClient } = require('@supabase/supabase-js');

// Your Supabase credentials
const SUPABASE_URL = 'https://xkrtqijtwpkgmystacvt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('\nRun with:');
  console.log('SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" node scripts/reset-admin-password.js');
  console.log('\nFind your service role key at:');
  console.log('https://supabase.com/dashboard/project/xkrtqijtwpkgmystacvt/settings/api');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// User UUIDs from your Supabase
const ADMIN_USER_ID = '20af8fae-5835-4f83-9b5a-9275d345221d';  // admin@wancom.pk
const DEMO_USER_ID = '2775ef86-6002-4c47-9b7a-6c1f60f114ef';   // demo@wancom.pk

async function resetPassword(userId, email, newPassword) {
  console.log(`\n🔄 Resetting password for ${email}...`);
  
  const { data, error } = await supabase.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }

  console.log(`✅ Password reset successfully for ${email}`);
  console.log(`   New password: ${newPassword}`);
  return true;
}

async function main() {
  console.log('🔐 WANCOM Password Reset Script');
  console.log('================================\n');

  // Reset admin password
  await resetPassword(ADMIN_USER_ID, 'admin@wancom.pk', '@dmin123456');
  
  // Optionally reset demo user password too
  // await resetPassword(DEMO_USER_ID, 'demo@wancom.pk', 'demo123456');

  console.log('\n✨ Done! You can now login at /admin/login with:');
  console.log('   Email: admin@wancom.pk');
  console.log('   Password: @dmin123456');
}

main().catch(console.error);
