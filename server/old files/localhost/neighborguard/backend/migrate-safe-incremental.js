// ============================================================================
// Safe Incremental Migration - Only adds new fields, doesn't modify PKs
// Run with: node migrate-safe-incremental.js
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');

async function runMigration() {
  console.log('\n🔄 Safe Incremental Migration');
  console.log('='.repeat(60));
  console.log('This migration only ADDS new columns, does not modify existing PKs\n');

  try {
    // Step 1: Add isEntryPoint to zones (if not exists)
    console.log('📋 Step 1: Adding is_entry_point to zones...');
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE zones 
        ADD COLUMN IF NOT EXISTS is_entry_point BOOLEAN DEFAULT false
      `);
      console.log('   ✅ Added is_entry_point');
    } catch (err) {
      if (err.message.includes('already exists') || err.code === '42701') {
        console.log('   ⏭️  Column already exists, skipping');
      } else {
        console.log('   ⚠️  Warning:', err.message);
      }
    }

    // Step 2: Verify the column exists
    console.log('\n📋 Step 2: Verifying schema...');
    
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'zones' 
      AND column_name = 'is_entry_point'
    `;
    
    if (columns.length > 0) {
      console.log('   ✅ is_entry_point column verified');
    } else {
      console.log('   ⚠️  Column not found - may need manual migration');
    }

    // Step 3: Set default entry points based on zone type
    console.log('\n📋 Step 3: Setting default entry points...');
    
    const entryZones = await prisma.$executeRawUnsafe(`
      UPDATE zones 
      SET is_entry_point = true 
      WHERE zone_type ILIKE '%DOOR%' 
         OR zone_type ILIKE '%ENTRANCE%'
         OR zone_type ILIKE '%GARAGE_ENTRANCE%'
    `);
    console.log(`   ✅ Updated entry point flags`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Safe Migration Complete!');
    console.log('='.repeat(60));
    console.log('\nNote: SensorType and other enum changes are handled at');
    console.log('runtime - Prisma schema is source of truth.');
    console.log('\nTo fully apply schema, you can run:');
    console.log('  npx prisma db push --accept-data-loss');
    console.log('  (Only if you accept potential data loss on empty/dev DB)');

  } catch (error) {
    console.error('\n❌ Migration error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
