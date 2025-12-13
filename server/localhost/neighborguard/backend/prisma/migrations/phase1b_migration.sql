-- ============================================================================
-- NeighborGuard Phase 1B Migration
-- Home Assistant Sensor Integration
-- ============================================================================

-- 1. Add new enums
DO $$ BEGIN
    CREATE TYPE "HouseMode" AS ENUM ('DISARMED', 'HOME', 'AWAY', 'NIGHT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SensorType" AS ENUM ('DOOR_CONTACT', 'PIR', 'GLASS_BREAK', 'VIBRATION', 'SMOKE', 'WATER_LEAK', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SensorStatus" AS ENUM ('ONLINE', 'OFFLINE', 'LOW_BATTERY', 'UNKNOWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "IntegrationType" AS ENUM ('HOME_ASSISTANT', 'MQTT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "EventSourceType" AS ENUM ('MANUAL', 'CAMERA', 'SENSOR', 'EXTERNAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add new columns to homes table
ALTER TABLE homes 
ADD COLUMN IF NOT EXISTS house_mode "HouseMode" DEFAULT 'DISARMED',
ADD COLUMN IF NOT EXISTS night_mode_auto BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS night_mode_start VARCHAR(5) DEFAULT '22:00',
ADD COLUMN IF NOT EXISTS night_mode_end VARCHAR(5) DEFAULT '06:00',
ADD COLUMN IF NOT EXISTS night_mode_high_only BOOLEAN DEFAULT false;

-- 3. Add new columns to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS source_type "EventSourceType" DEFAULT 'MANUAL',
ADD COLUMN IF NOT EXISTS sensor_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS sensor_type "SensorType",
ADD COLUMN IF NOT EXISTS external_event_id VARCHAR(255);

-- 4. Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    circle_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type "IntegrationType" DEFAULT 'HOME_ASSISTANT',
    webhook_token VARCHAR(255) UNIQUE DEFAULT gen_random_uuid()::text,
    webhook_secret VARCHAR(255),
    base_url VARCHAR(500),
    access_token TEXT,
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP,
    device_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_integrations_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integrations_circle_id ON integrations(circle_id);
CREATE INDEX IF NOT EXISTS idx_integrations_webhook_token ON integrations(webhook_token);

-- 5. Create sensors table
CREATE TABLE IF NOT EXISTS sensors (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    circle_id VARCHAR(255) NOT NULL,
    integration_id VARCHAR(255) NOT NULL,
    zone_id VARCHAR(255),
    external_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    sensor_type "SensorType" DEFAULT 'OTHER',
    status "SensorStatus" DEFAULT 'UNKNOWN',
    last_state VARCHAR(50),
    last_state_at TIMESTAMP,
    battery_level INTEGER,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sensors_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    CONSTRAINT fk_sensors_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
    CONSTRAINT fk_sensors_zone FOREIGN KEY (zone_id) REFERENCES zones(id),
    CONSTRAINT uq_sensors_integration_external UNIQUE (integration_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_sensors_circle_id ON sensors(circle_id);

-- 6. Add foreign key for events.sensor_id
ALTER TABLE events
DROP CONSTRAINT IF EXISTS fk_events_sensor;

ALTER TABLE events
ADD CONSTRAINT fk_events_sensor FOREIGN KEY (sensor_id) REFERENCES sensors(id);

-- 7. Create trigger for updated_at on new tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;
CREATE TRIGGER update_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sensors_updated_at ON sensors;
CREATE TRIGGER update_sensors_updated_at
    BEFORE UPDATE ON sensors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration complete!
-- ============================================================================
