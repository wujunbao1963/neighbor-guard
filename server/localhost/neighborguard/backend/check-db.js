// Quick database check script
require('dotenv').config();
const { Client } = require('pg');

async function checkDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL\n');

    // List all tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Existing tables:');
    tables.rows.forEach(r => console.log('  -', r.table_name));
    console.log(`\nTotal: ${tables.rows.length} tables\n`);

    // Check for key data counts
    const counts = [
      { name: 'users', table: 'users' },
      { name: 'circles', table: 'circles' },
      { name: 'homes', table: 'homes' },
      { name: 'zones', table: 'zones' },
      { name: 'sensors', table: 'sensors' },
      { name: 'events', table: 'events' },
      { name: 'integrations', table: 'integrations' }
    ];

    console.log('📊 Data counts:');
    for (const { name, table } of counts) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`  ${name}: ${result.rows[0].count}`);
      } catch (e) {
        console.log(`  ${name}: (table not found)`);
      }
    }

    // Check if Phase 2 tables exist
    console.log('\n🔍 Phase 2 tables check:');
    const phase2Tables = ['sensor_events', 'tracks'];
    for (const table of phase2Tables) {
      const exists = tables.rows.some(r => r.table_name === table);
      console.log(`  ${table}: ${exists ? '✅ exists' : '❌ not yet created'}`);
    }

    // Check if Phase 2 columns exist in events
    console.log('\n🔍 Phase 2 columns in events:');
    const eventCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events'
      ORDER BY ordinal_position
    `);
    const phase2Cols = ['is_security_event', 'primary_track_id', 'path_summary', 'dwell_seconds_private', 'fusion_rule', 'contributing_sensor_ids'];
    phase2Cols.forEach(col => {
      const exists = eventCols.rows.some(r => r.column_name === col);
      console.log(`  ${col}: ${exists ? '✅ exists' : '❌ not yet created'}`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

checkDB();
