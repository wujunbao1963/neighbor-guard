// Phase 2 Migration Verification Script
// Run with: node verify-phase2.js

require('dotenv').config();
const { Client } = require('pg');

async function verify() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('🔍 Phase 2 Migration Verification\n');
    console.log('='.repeat(50));

    let allPassed = true;

    // Check 1: New tables exist
    console.log('\n1️⃣  New Tables:');
    const newTables = ['tracks', 'sensor_events'];
    for (const table of newTables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [table]);
      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
      if (!exists) allPassed = false;
    }

    // Check 2: New enums exist
    console.log('\n2️⃣  New Enums:');
    const newEnums = ['ObjectType', 'PrivacyLevel'];
    for (const enumName of newEnums) {
      const result = await client.query(`
        SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = $1)
      `, [enumName]);
      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} ${enumName}`);
      if (!exists) allPassed = false;
    }

    // Check 3: FUSION in EventSourceType
    console.log('\n3️⃣  EventSourceType includes FUSION:');
    const enumValues = await client.query(`
      SELECT enumlabel FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EventSourceType')
    `);
    const hasFusion = enumValues.rows.some(r => r.enumlabel === 'FUSION');
    console.log(`   ${hasFusion ? '✅' : '❌'} FUSION value`);
    if (!hasFusion) allPassed = false;

    // Check 4: New columns in events
    console.log('\n4️⃣  New columns in events table:');
    const eventColumns = ['is_security_event', 'primary_track_id', 'path_summary', 
                          'dwell_seconds_private', 'fusion_rule', 'contributing_sensor_ids'];
    for (const col of eventColumns) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'events' AND column_name = $1
        )
      `, [col]);
      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} ${col}`);
      if (!exists) allPassed = false;
    }

    // Check 5: privacy_level in zones
    console.log('\n5️⃣  New column in zones table:');
    const zoneCol = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'zones' AND column_name = 'privacy_level'
      )
    `);
    const hasPrivacy = zoneCol.rows[0].exists;
    console.log(`   ${hasPrivacy ? '✅' : '❌'} privacy_level`);
    if (!hasPrivacy) allPassed = false;

    // Check 6: Foreign keys
    console.log('\n6️⃣  Foreign keys:');
    const fkeys = await client.query(`
      SELECT conname FROM pg_constraint 
      WHERE contype = 'f' AND conname LIKE '%track%' OR conname LIKE '%sensor_events%'
    `);
    const expectedFkeys = [
      'tracks_circle_id_fkey',
      'tracks_home_id_fkey', 
      'sensor_events_circle_id_fkey',
      'sensor_events_sensor_id_fkey',
      'events_primary_track_id_fkey'
    ];
    for (const fk of expectedFkeys) {
      const exists = fkeys.rows.some(r => r.conname === fk);
      console.log(`   ${exists ? '✅' : '❌'} ${fk}`);
      if (!exists) allPassed = false;
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('✅ All Phase 2 migration checks PASSED!');
      console.log('\nYou can now proceed to Step 2: FusionEngine Service');
    } else {
      console.log('❌ Some checks FAILED. Please review and re-run migration.');
    }
    console.log('='.repeat(50) + '\n');

    // Show data counts
    console.log('📊 Current data:');
    const tables = ['users', 'circles', 'homes', 'zones', 'sensors', 'events', 'tracks', 'sensor_events'];
    for (const table of tables) {
      try {
        const count = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`   ${table}: ${count.rows[0].count}`);
      } catch (e) {
        console.log(`   ${table}: error`);
      }
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

verify();
