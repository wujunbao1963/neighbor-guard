-- Phase 2: Fusion Engine Migration
-- Adds SensorEvent, Track models and enhances Event model

-- CreateEnum: ObjectType
CREATE TYPE "ObjectType" AS ENUM ('PERSON', 'VEHICLE', 'ANIMAL', 'PACKAGE', 'UNKNOWN');

-- CreateEnum: PrivacyLevel
CREATE TYPE "PrivacyLevel" AS ENUM ('PUBLIC', 'SEMI_PRIVATE', 'PRIVATE', 'RESTRICTED');

-- AlterEnum: Add FUSION to EventSourceType
ALTER TYPE "EventSourceType" ADD VALUE 'FUSION';

-- AlterTable: Add privacyLevel to zones
ALTER TABLE "zones" ADD COLUMN "privacy_level" "PrivacyLevel" NOT NULL DEFAULT 'SEMI_PRIVATE';

-- AlterTable: Add Phase 2 fields to events
ALTER TABLE "events" ADD COLUMN "is_security_event" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "events" ADD COLUMN "primary_track_id" TEXT;
ALTER TABLE "events" ADD COLUMN "path_summary" TEXT;
ALTER TABLE "events" ADD COLUMN "dwell_seconds_private" INTEGER;
ALTER TABLE "events" ADD COLUMN "fusion_rule" TEXT;
ALTER TABLE "events" ADD COLUMN "contributing_sensor_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: tracks
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sensor_events
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
);

-- CreateIndex: tracks
CREATE INDEX "tracks_circle_id_start_time_idx" ON "tracks"("circle_id", "start_time");
CREATE INDEX "tracks_home_id_idx" ON "tracks"("home_id");

-- CreateIndex: sensor_events
CREATE INDEX "sensor_events_circle_id_occurred_at_idx" ON "sensor_events"("circle_id", "occurred_at");
CREATE INDEX "sensor_events_sensor_id_occurred_at_idx" ON "sensor_events"("sensor_id", "occurred_at");
CREATE INDEX "sensor_events_track_id_idx" ON "sensor_events"("track_id");

-- AddForeignKey: tracks
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sensor_events
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: events.primary_track_id
ALTER TABLE "events" ADD CONSTRAINT "events_primary_track_id_fkey" FOREIGN KEY ("primary_track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
