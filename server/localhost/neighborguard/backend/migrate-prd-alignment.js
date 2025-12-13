// ============================================================================
// Phase 2 PRD Alignment Migration
// Adds new columns for isEntryPoint on zones
// Run with: npm run db:migrate-prd-alignment
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');

async function runMigration() {
  console.log('\n🔄 Phase 2 PRD Alignment Migration');
  console.log('='.repeat(60));

  try {
    // Step 1: Add isEntryPoint column to zones table
    console.log('\n📋 Step 1: Adding is_entry_point column to zones...');
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE zones 
        ADD COLUMN IF NOT EXISTS is_entry_point BOOLEAN DEFAULT false
      `);
      console.log('   ✅ Added is_entry_point column');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   ⚠️ Column already exists, skipping');
      } else {
        throw err;
      }
    }

    // Step 2: Set default entry point zones
    console.log('\n📋 Step 2: Setting default entry points...');
    const entryPointTypes = ['FRONT_DOOR', 'BACK_DOOR', 'SIDE_DOOR', 'GARAGE_ENTRANCE'];
    for (const zoneType of entryPointTypes) {
      const result = await prisma.zone.updateMany({
        where: { 
          zoneType: { contains: zoneType, mode: 'insensitive' }
        },
        data: { isEntryPoint: true }
      });
      if (result.count > 0) {
        console.log(`   ✅ Set ${result.count} zones as entry points for ${zoneType}`);
      }
    }

    // Step 3: Set default privacy levels based on zone types
    console.log('\n📋 Step 3: Setting default privacy levels...');
    
    // Public zones
    const publicTypes = ['STREET_FRONT', 'STREET', 'SIDEWALK'];
    for (const zoneType of publicTypes) {
      await prisma.zone.updateMany({
        where: { 
          zoneType: { contains: zoneType, mode: 'insensitive' },
          privacyLevel: 'SEMI_PRIVATE' // Only update if still default
        },
        data: { privacyLevel: 'PUBLIC' }
      });
    }

    // Private zones (backyard, side)
    const privateTypes = ['BACK_YARD', 'BACKYARD', 'SIDE_YARD', 'SIDE_ALLEY', 'ALLEY'];
    for (const zoneType of privateTypes) {
      await prisma.zone.updateMany({
        where: { 
          zoneType: { contains: zoneType, mode: 'insensitive' },
          privacyLevel: 'SEMI_PRIVATE'
        },
        data: { privacyLevel: 'PRIVATE' }
      });
    }

    // Restricted zones (interior)
    const restrictedTypes = ['LIVING', 'HALLWAY', 'STAIRS', 'BASEMENT', 'GARAGE_INTERIOR', 'INTERIOR'];
    for (const zoneType of restrictedTypes) {
      await prisma.zone.updateMany({
        where: { 
          zoneType: { contains: zoneType, mode: 'insensitive' },
          privacyLevel: { in: ['SEMI_PRIVATE', 'PRIVATE'] }
        },
        data: { privacyLevel: 'RESTRICTED' }
      });
    }

    console.log('   ✅ Updated privacy levels based on zone types');

    // Step 4: Verify migration
    console.log('\n📋 Step 4: Verifying migration...');
    
    const zoneStats = await prisma.zone.groupBy({
      by: ['privacyLevel'],
      _count: { id: true }
    });
    
    console.log('   Zone privacy level distribution:');
    for (const stat of zoneStats) {
      console.log(`     ${stat.privacyLevel}: ${stat._count.id} zones`);
    }

    const entryPointCount = await prisma.zone.count({
      where: { isEntryPoint: true }
    });
    console.log(`   Entry point zones: ${entryPointCount}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ PRD Alignment Migration Complete!');
    console.log('='.repeat(60));
    console.log('\nNew schema features:');
    console.log('  • SensorType enum: Added CAMERA_PERSON, CAMERA_VEHICLE, CAMERA_PACKAGE, etc.');
    console.log('  • ZoneType enum: Added FRONT_DOOR, BACK_DOOR, GARAGE_ENTRANCE, etc.');
    console.log('  • SecurityEventType enum: Added all 6 PRD event types');
    console.log('  • Zone.isEntryPoint: Flag for break-in detection');
    console.log('\nRun "npx prisma generate" to update Prisma client.');

  } catch (error) {
    console.error('\n❌ Migration error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration().catch(console.error);
