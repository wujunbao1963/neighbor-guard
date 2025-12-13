// ============================================================================
// Database Reset Script
// Run with: node prisma/reset.js
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reset() {
  console.log('🗑️  Resetting database...\n');

  // Delete in correct order (respecting foreign keys)
  const tables = [
    { name: 'EventMedia', model: prisma.eventMedia },
    { name: 'EventFeedback', model: prisma.eventFeedback },
    { name: 'Event', model: prisma.event },
    { name: 'Zone', model: prisma.zone },
    { name: 'Home', model: prisma.home },
    { name: 'CircleMember', model: prisma.circleMember },
    { name: 'Circle', model: prisma.circle },
    { name: 'RefreshToken', model: prisma.refreshToken },
    { name: 'AuthCode', model: prisma.authCode },
    { name: 'User', model: prisma.user },
    { name: 'EmailWhitelist', model: prisma.emailWhitelist },
    // Note: ZoneTypeConfig and EventTypeConfig are no longer used
    // Configuration is now in code: src/config/constants.js
  ];

  for (const table of tables) {
    try {
      const result = await table.model.deleteMany();
      console.log(`   ✅ ${table.name}: deleted ${result.count} records`);
    } catch (err) {
      console.log(`   ⚠️  ${table.name}: ${err.message}`);
    }
  }

  console.log('\n✨ Database reset complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Restart the backend server');
  console.log('   2. Call POST /api/auth/admin/init-super-admin to create admin');
  console.log('   3. Login with admin@neighborguard.app + code 587585');
  console.log('\n💡 Zone types and event types are now in code (no seed needed)\n');
}

reset()
  .catch((e) => {
    console.error('❌ Reset error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
