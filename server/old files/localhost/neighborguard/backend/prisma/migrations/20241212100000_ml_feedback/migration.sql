-- ============================================================================
-- Phase 2: ML Feedback Migration
-- Adds EventFeedback and EventMLFeature tables for ML-based notification tuning
-- ============================================================================

-- Create FeedbackLabel enum (ignore if exists)
CREATE TYPE "FeedbackLabel" AS ENUM ('FALSE_ALARM', 'USEFUL');

-- ============================================================================
-- EventFeedback table - stores user feedback on notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS "event_feedbacks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "circle_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "label" "FeedbackLabel" NOT NULL,
  "client_platform" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "event_feedbacks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_feedbacks_event_user_unique" UNIQUE ("event_id", "user_id"),
  CONSTRAINT "event_feedbacks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE,
  CONSTRAINT "event_feedbacks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "event_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "event_feedbacks_circle_created_idx" ON "event_feedbacks" ("circle_id", "created_at");

CREATE INDEX IF NOT EXISTS "event_feedbacks_event_idx" ON "event_feedbacks" ("event_id");

-- ============================================================================
-- EventMLFeature table - cached features for ML model
-- ============================================================================
CREATE TABLE IF NOT EXISTS "event_ml_features" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL UNIQUE,
  "circle_id" UUID NOT NULL,
  "home_id" UUID NOT NULL,
  
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
);

CREATE INDEX IF NOT EXISTS "event_ml_features_circle_type_idx" ON "event_ml_features" ("circle_id", "event_type");

CREATE INDEX IF NOT EXISTS "event_ml_features_circle_mode_idx" ON "event_ml_features" ("circle_id", "house_mode");

-- ============================================================================
-- Add ML score field to events table for storing prediction results
-- ============================================================================
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ml_score" DOUBLE PRECISION;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ml_suppressed" BOOLEAN DEFAULT FALSE
