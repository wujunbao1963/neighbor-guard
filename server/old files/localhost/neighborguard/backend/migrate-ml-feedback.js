// ============================================================================
// Phase 2: ML Feedback Migration Script
// Run with: npm run db:migrate-ml-feedback
// ============================================================================

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function runMigration() {
  console.log('\n🧠 Phase 2: ML Feedback Migration');
  console.log('='.repeat(50));

  try {
    // 1. Create FeedbackLabel enum
    console.log('\n📝 Step 1: Creating FeedbackLabel enum...');
    try {
      await prisma.$executeRawUnsafe(`CREATE TYPE "FeedbackLabel" AS ENUM ('FALSE_ALARM', 'USEFUL')`);
      console.log('   ✅ Created FeedbackLabel enum');
    } catch (err) {
      if (err.code === '42710' || err.message.includes('already exists')) {
        console.log('   ⏭️  FeedbackLabel enum already exists');
      } else {
        throw err;
      }
    }

    // 2. Create event_feedbacks table
    console.log('\n📝 Step 2: Creating event_feedbacks table...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "event_feedbacks" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "circle_id" TEXT NOT NULL,
          "event_id" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "label" "FeedbackLabel" NOT NULL,
          "client_platform" TEXT,
          "note" TEXT,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT "event_feedbacks_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "event_feedbacks_event_user_unique" UNIQUE ("event_id", "user_id"),
          CONSTRAINT "event_feedbacks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE,
          CONSTRAINT "event_feedbacks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
          CONSTRAINT "event_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
        )
      `);
      console.log('   ✅ Created event_feedbacks table');
    } catch (err) {
      if (err.code === '42P07' || err.message.includes('already exists')) {
        console.log('   ⏭️  event_feedbacks table already exists');
      } else {
        throw err;
      }
    }

    // 3. Create indexes for event_feedbacks
    console.log('\n📝 Step 3: Creating indexes for event_feedbacks...');
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX "event_feedbacks_circle_created_idx" ON "event_feedbacks" ("circle_id", "created_at")`);
      console.log('   ✅ Created event_feedbacks_circle_created_idx');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   ⏭️  Index already exists');
      } else {
        throw err;
      }
    }

    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX "event_feedbacks_event_idx" ON "event_feedbacks" ("event_id")`);
      console.log('   ✅ Created event_feedbacks_event_idx');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   ⏭️  Index already exists');
      } else {
        throw err;
      }
    }

    // 4. Create event_ml_features table
    console.log('\n📝 Step 4: Creating event_ml_features table...');
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "event_ml_features" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "event_id" TEXT NOT NULL UNIQUE,
          "circle_id" TEXT NOT NULL,
          "home_id" TEXT NOT NULL,
          "event_type" TEXT NOT NULL,
          "source_type" TEXT NOT NULL,
          "severity" TEXT NOT NULL,
          "house_mode" TEXT NOT NULL,
          "hour_bucket" INTEGER NOT NULL,
          "weekday" INTEGER NOT NULL,
          "has_door_contact" BOOLEAN NOT NULL DEFAULT FALSE,
          "has_inside_motion" BOOLEAN NOT NULL DEFAULT FALSE,
          "has_camera_person" BOOLEAN NOT NULL DEFAULT FALSE,
          "has_glass_break" BOOLEAN NOT NULL DEFAULT FALSE,
          "sensor_count" INTEGER NOT NULL DEFAULT 0,
          "has_private_zone" BOOLEAN NOT NULL DEFAULT FALSE,
          "dwell_private_sec" INTEGER NOT NULL DEFAULT 0,
          "dwell_total_sec" INTEGER NOT NULL DEFAULT 0,
          "hist_false_rate_type" DOUBLE PRECISION,
          "hist_false_rate_sensor" DOUBLE PRECISION,
          "hist_false_rate_hour" DOUBLE PRECISION,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT "event_ml_features_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "event_ml_features_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
          CONSTRAINT "event_ml_features_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE
        )
      `);
      console.log('   ✅ Created event_ml_features table');
    } catch (err) {
      if (err.code === '42P07' || err.message.includes('already exists')) {
        console.log('   ⏭️  event_ml_features table already exists');
      } else {
        throw err;
      }
    }

    // 5. Create indexes for event_ml_features
    console.log('\n📝 Step 5: Creating indexes for event_ml_features...');
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX "event_ml_features_circle_type_idx" ON "event_ml_features" ("circle_id", "event_type")`);
      console.log('   ✅ Created event_ml_features_circle_type_idx');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   ⏭️  Index already exists');
      } else {
        throw err;
      }
    }

    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX "event_ml_features_circle_mode_idx" ON "event_ml_features" ("circle_id", "house_mode")`);
      console.log('   ✅ Created event_ml_features_circle_mode_idx');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   ⏭️  Index already exists');
      } else {
        throw err;
      }
    }

    // 6. Add ml_score and ml_suppressed columns to events table
    console.log('\n📝 Step 6: Adding ML columns to events table...');
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN "ml_score" DOUBLE PRECISION`);
      console.log('   ✅ Added ml_score column');
    } catch (err) {
      if (err.code === '42701' || err.message.includes('already exists')) {
        console.log('   ⏭️  ml_score column already exists');
      } else {
        throw err;
      }
    }

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN "ml_suppressed" BOOLEAN DEFAULT FALSE`);
      console.log('   ✅ Added ml_suppressed column');
    } catch (err) {
      if (err.code === '42701' || err.message.includes('already exists')) {
        console.log('   ⏭️  ml_suppressed column already exists');
      } else {
        throw err;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ ML Feedback migration complete!');
    console.log('='.repeat(50));
    console.log('\n📊 New tables created:');
    console.log('  - event_feedbacks: User feedback on notifications');
    console.log('  - event_ml_features: Cached features for ML model');
    console.log('\n📊 New Event columns:');
    console.log('  - ml_score: Model prediction (0-1)');
    console.log('  - ml_suppressed: Whether notification was suppressed');
    console.log('\n🧪 Next step: Run "node test-ml-feedback.js" to verify');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
