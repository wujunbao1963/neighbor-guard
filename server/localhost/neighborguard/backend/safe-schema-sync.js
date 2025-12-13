// ============================================================================
// Phase 2 PRD Alignment - Safe Schema Sync
// Handles foreign key dependencies when updating schema
// Run with: node safe-schema-sync.js
// ============================================================================

require('dotenv').config();
const prisma = require('./src/config/database');

async function runSync() {
  console.log('\n🔄 Safe Schema Sync for PRD Alignment');
  console.log('='.repeat(60));

  try {
    // Step 1: Add new columns that don't have dependencies
    console.log('\n📋 Step 1: Adding new columns to zones table...');
    
    // Add is_entry_point column
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE zones 
        ADD COLUMN IF NOT EXISTS is_entry_point BOOLEAN DEFAULT false
      `);
      console.log('   ✅ Added is_entry_point column to zones');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   ⚠️ is_entry_point column already exists');
      } else {
        console.log('   ⚠️ Could not add is_entry_point:', err.message);
      }
    }

    // Step 2: Update enum types if needed (PostgreSQL specific)
    console.log('\n📋 Step 2: Updating enum types...');
    
    // Add new SensorType values
    const newSensorTypes = [
      'WINDOW_CONTACT', 'LOCK', 'CO_DETECTOR',
      'CAMERA_MOTION', 'CAMERA_PERSON', 'CAMERA_VEHICLE', 
      'CAMERA_PACKAGE', 'CAMERA_ANIMAL',
      'MIC_UNUSUAL_NOISE', 'MIC_BABY_CRY', 'MIC_GLASS_BREAK',
      'GENERIC_SENSOR'
    ];

    for (const sensorType of newSensorTypes) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TYPE "SensorType" ADD VALUE IF NOT EXISTS '${sensorType}'
        `);
        console.log(`   ✅ Added SensorType: ${sensorType}`);
      } catch (err) {
        // Value might already exist
        if (!err.message.includes('already exists')) {
          console.log(`   ⚠️ Could not add ${sensorType}: ${err.message}`);
        }
      }
    }

    // Add new ZoneType enum (if it exists as enum)
    // Note: In our schema, zoneType is String, not enum, so we skip this

    // Step 3: Create SecurityEventType enum if it doesn't exist
    console.log('\n📋 Step 3: Creating SecurityEventType enum...');
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "SecurityEventType" AS ENUM (
            'BREAK_IN_ATTEMPT',
            'PERIMETER_DAMAGE',
            'SUSPICIOUS_PERSON',
            'SUSPICIOUS_VEHICLE',
            'UNUSUAL_NOISE',
            'PACKAGE_DELIVERED',
            'PACKAGE_TAKEN',
            'FIRE_DETECTED',
            'CO_DETECTED',
            'WATER_LEAK_DETECTED',
            'MOTION_DETECTED',
            'CUSTOM_EVENT'
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log('   ✅ SecurityEventType enum ready');
    } catch (err) {
      console.log('   ⚠️ SecurityEventType enum:', err.message);
    }

    // Step 4: Set default values for entry points
    console.log('\n📋 Step 4: Setting default entry point zones...');
    const entryPointPatterns = ['front_door', 'back_door', 'side_door', 'garage_entrance', 'door'];
    
    for (const pattern of entryPointPatterns) {
      try {
        const result = await prisma.$executeRawUnsafe(`
          UPDATE zones 
          SET is_entry_point = true 
          WHERE LOWER(zone_type) LIKE '%${pattern}%'
            AND is_entry_point = false
        `);
        console.log(`   ✅ Updated zones matching "${pattern}"`);
      } catch (err) {
        console.log(`   ⚠️ Could not update ${pattern}:`, err.message);
      }
    }

    // Step 5: Set default privacy levels based on zone types
    console.log('\n📋 Step 5: Setting default privacy levels...');
    
    // Public zones
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE zones 
        SET privacy_level = 'PUBLIC' 
        WHERE (LOWER(zone_type) LIKE '%street%' OR LOWER(zone_type) LIKE '%sidewalk%')
          AND privacy_level = 'SEMI_PRIVATE'
      `);
      console.log('   ✅ Set PUBLIC zones');
    } catch (err) {
      console.log('   ⚠️ Could not update PUBLIC zones:', err.message);
    }

    // Private zones (backyard, side)
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE zones 
        SET privacy_level = 'PRIVATE' 
        WHERE (LOWER(zone_type) LIKE '%back%' OR LOWER(zone_type) LIKE '%side%' OR LOWER(zone_type) LIKE '%alley%')
          AND privacy_level = 'SEMI_PRIVATE'
      `);
      console.log('   ✅ Set PRIVATE zones');
    } catch (err) {
      console.log('   ⚠️ Could not update PRIVATE zones:', err.message);
    }

    // Restricted zones (interior)
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE zones 
        SET privacy_level = 'RESTRICTED' 
        WHERE (LOWER(zone_type) LIKE '%living%' OR LOWER(zone_type) LIKE '%hall%' 
               OR LOWER(zone_type) LIKE '%stair%' OR LOWER(zone_type) LIKE '%basement%'
               OR LOWER(zone_type) LIKE '%interior%')
          AND privacy_level IN ('SEMI_PRIVATE', 'PRIVATE')
      `);
      console.log('   ✅ Set RESTRICTED zones');
    } catch (err) {
      console.log('   ⚠️ Could not update RESTRICTED zones:', err.message);
    }

    // Step 6: Verify changes
    console.log('\n📋 Step 6: Verifying changes...');
    
    // Check zones
    const zoneStats = await prisma.$queryRaw`
      SELECT privacy_level, COUNT(*) as count 
      FROM zones 
      GROUP BY privacy_level
    `;
    console.log('   Zone privacy levels:');
    for (const stat of zoneStats) {
      console.log(`     ${stat.privacy_level}: ${stat.count}`);
    }

    // Check entry points
    const entryPointCount = await prisma.zone.count({
      where: { isEntryPoint: true }
    });
    console.log(`   Entry point zones: ${entryPointCount}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Safe Schema Sync Complete!');
    console.log('='.repeat(60));
    console.log('\nNote: The schema.prisma file has new enums and fields.');
    console.log('The database now has the necessary columns.');
    console.log('\nIf you need to fully reset, run:');
    console.log('  npx prisma migrate reset --force');
    console.log('  npx prisma db push');

  } catch (error) {
    console.error('\n❌ Sync error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runSync().catch(console.error);
