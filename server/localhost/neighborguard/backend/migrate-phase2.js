// Phase 2 Migration Script
// Run with: node migrate-phase2.js
// This adds Phase 2 tables and columns on top of existing Phase 1B data

require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check if migration already applied
    const checkTracks = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tracks'
      )
    `);
    
    if (checkTracks.rows[0].exists) {
      console.log('⚠️  Phase 2 migration appears to already be applied (tracks table exists)');
      console.log('   Skipping migration. Delete tracks/sensor_events tables to re-run.\n');
      return;
    }

    console.log('🚀 Starting Phase 2 migration...\n');

    // Step 1: Create new enums
    console.log('1. Creating new enums...');
    
    // Check if ObjectType enum exists
    const objectTypeExists = await client.query(`
      SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObjectType')
    `);
    if (!objectTypeExists.rows[0].exists) {
      await client.query(`CREATE TYPE "ObjectType" AS ENUM ('PERSON', 'VEHICLE', 'ANIMAL', 'PACKAGE', 'UNKNOWN')`);
      console.log('   ✅ Created ObjectType enum');
    } else {
      console.log('   ⏭️  ObjectType enum already exists');
    }

    // Check if PrivacyLevel enum exists
    const privacyLevelExists = await client.query(`
      SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivacyLevel')
    `);
    if (!privacyLevelExists.rows[0].exists) {
      await client.query(`CREATE TYPE "PrivacyLevel" AS ENUM ('PUBLIC', 'SEMI_PRIVATE', 'PRIVATE', 'RESTRICTED')`);
      console.log('   ✅ Created PrivacyLevel enum');
    } else {
      console.log('   ⏭️  PrivacyLevel enum already exists');
    }

    // Add FUSION to EventSourceType if not exists
    try {
      await client.query(`ALTER TYPE "EventSourceType" ADD VALUE IF NOT EXISTS 'FUSION'`);
      console.log('   ✅ Added FUSION to EventSourceType');
    } catch (e) {
      console.log('   ⏭️  FUSION already in EventSourceType');
    }

    // Step 2: Add privacy_level to zones
    console.log('\n2. Adding privacy_level to zones...');
    const zoneColExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'zones' AND column_name = 'privacy_level'
      )
    `);
    if (!zoneColExists.rows[0].exists) {
      await client.query(`ALTER TABLE "zones" ADD COLUMN "privacy_level" "PrivacyLevel" NOT NULL DEFAULT 'SEMI_PRIVATE'`);
      console.log('   ✅ Added privacy_level column');
    } else {
      console.log('   ⏭️  privacy_level column already exists');
    }

    // Step 3: Add Phase 2 columns to events
    console.log('\n3. Adding Phase 2 columns to events...');
    const eventColumns = [
      { name: 'is_security_event', sql: `ADD COLUMN "is_security_event" BOOLEAN NOT NULL DEFAULT true` },
      { name: 'primary_track_id', sql: `ADD COLUMN "primary_track_id" TEXT` },
      { name: 'path_summary', sql: `ADD COLUMN "path_summary" TEXT` },
      { name: 'dwell_seconds_private', sql: `ADD COLUMN "dwell_seconds_private" INTEGER` },
      { name: 'fusion_rule', sql: `ADD COLUMN "fusion_rule" TEXT` },
      { name: 'contributing_sensor_ids', sql: `ADD COLUMN "contributing_sensor_ids" TEXT[] DEFAULT ARRAY[]::TEXT[]` }
    ];

    for (const col of eventColumns) {
      const exists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'events' AND column_name = '${col.name}'
        )
      `);
      if (!exists.rows[0].exists) {
        await client.query(`ALTER TABLE "events" ${col.sql}`);
        console.log(`   ✅ Added ${col.name}`);
      } else {
        console.log(`   ⏭️  ${col.name} already exists`);
      }
    }

    // Step 4: Create tracks table
    console.log('\n4. Creating tracks table...');
    await client.query(`
      CREATE TABLE "tracks" (
        "id" TEXT NOT NULL,
        "circle_id" TEXT NOT NULL,
        "home_id" TEXT NOT NULL,
        "object_type" "ObjectType" NOT NULL DEFAULT 'UNKNOWN',
        "start_time" TIMESTAMP(3) NOT NULL,
        "end_time" TIMESTAMP(3) NOT NULL,
        "path_summary" TEXT,
        "max_privacy_level" "PrivacyLevel",
        "dwell_seconds_private" INTEGER,
        "segments" JSONB,
        "is_closed" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   ✅ Created tracks table');

    // Step 5: Create sensor_events table
    console.log('\n5. Creating sensor_events table...');
    await client.query(`
      CREATE TABLE "sensor_events" (
        "id" TEXT NOT NULL,
        "circle_id" TEXT NOT NULL,
        "sensor_id" TEXT NOT NULL,
        "zone_id" TEXT,
        "new_state" TEXT NOT NULL,
        "old_state" TEXT,
        "occurred_at" TIMESTAMP(3) NOT NULL,
        "raw_payload" JSONB,
        "processed" BOOLEAN NOT NULL DEFAULT false,
        "track_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "sensor_events_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   ✅ Created sensor_events table');

    // Step 6: Create indexes
    console.log('\n6. Creating indexes...');
    await client.query(`CREATE INDEX "tracks_circle_id_start_time_idx" ON "tracks"("circle_id", "start_time")`);
    await client.query(`CREATE INDEX "tracks_home_id_idx" ON "tracks"("home_id")`);
    await client.query(`CREATE INDEX "sensor_events_circle_id_occurred_at_idx" ON "sensor_events"("circle_id", "occurred_at")`);
    await client.query(`CREATE INDEX "sensor_events_sensor_id_occurred_at_idx" ON "sensor_events"("sensor_id", "occurred_at")`);
    await client.query(`CREATE INDEX "sensor_events_track_id_idx" ON "sensor_events"("track_id")`);
    console.log('   ✅ Created all indexes');

    // Step 7: Add foreign keys
    console.log('\n7. Adding foreign keys...');
    await client.query(`ALTER TABLE "tracks" ADD CONSTRAINT "tracks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    await client.query(`ALTER TABLE "tracks" ADD CONSTRAINT "tracks_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    await client.query(`ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    await client.query(`ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    await client.query(`ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
    await client.query(`ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
    await client.query(`ALTER TABLE "events" ADD CONSTRAINT "events_primary_track_id_fkey" FOREIGN KEY ("primary_track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
    console.log('   ✅ Added all foreign keys');

    console.log('\n🎉 Phase 2 migration completed successfully!\n');

    // Verify
    console.log('📋 Verification:');
    const finalTables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log('   Tables:', finalTables.rows.map(r => r.table_name).join(', '));

  } catch (err) {
    console.error('\n❌ Migration error:', err.message);
    console.error(err.stack);
  } finally {
    await client.end();
  }
}

migrate();
