-- ============================================================================
-- NeighborGuard Complete Database Schema
-- Phase 1A (Base) + Phase 1B (Home Assistant Integration)
-- ============================================================================

-- ============================================================================
-- STEP 1: Create all ENUMS
-- ============================================================================

-- Phase 1A Enums
DO $$ BEGIN
    CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "HouseType" AS ENUM ('DETACHED', 'SEMI', 'ROW', 'APARTMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "OccupancyPattern" AS ENUM ('NORMAL', 'DAYTIME_EMPTY', 'VACATION_MODE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'HOUSEHOLD', 'NEIGHBOR', 'RELATIVE', 'OBSERVER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "EventSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "EventStatus" AS ENUM ('OPEN', 'ACKED', 'WATCHING', 'RESOLVED_OK', 'RESOLVED_WARNING', 'ESCALATED', 'FALSE_ALARM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "NoteType" AS ENUM ('REACTION', 'COMMENT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'VIDEO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "MediaSourceType" AS ENUM ('CAMERA_EXPORT', 'USER_UPLOAD', 'SCREENSHOT', 'EXTERNAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Phase 1B Enums
DO $$ BEGIN
    CREATE TYPE "HouseMode" AS ENUM ('DISARMED', 'HOME', 'AWAY', 'NIGHT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "SensorType" AS ENUM ('DOOR_CONTACT', 'PIR', 'GLASS_BREAK', 'VIBRATION', 'SMOKE', 'WATER_LEAK', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "SensorStatus" AS ENUM ('ONLINE', 'OFFLINE', 'LOW_BATTERY', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "IntegrationType" AS ENUM ('HOME_ASSISTANT', 'MQTT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "EventSourceType" AS ENUM ('MANUAL', 'CAMERA', 'SENSOR', 'EXTERNAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- STEP 2: Create base tables (Phase 1A)
-- ============================================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    phone VARCHAR(50),
    admin_role "AdminRole",
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Email Whitelist
CREATE TABLE IF NOT EXISTS email_whitelist (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email VARCHAR(255) UNIQUE NOT NULL,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auth Codes
CREATE TABLE IF NOT EXISTS auth_codes (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_auth_codes_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_email_expires ON auth_codes(email, expires_at);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    device_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Device Tokens
CREATE TABLE IF NOT EXISTS device_tokens (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL,
    token VARCHAR(500) UNIQUE NOT NULL,
    platform "Platform" DEFAULT 'IOS',
    device_name VARCHAR(255),
    app_version VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_device_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

-- Circles
CREATE TABLE IF NOT EXISTS circles (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_circles_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_circles_owner ON circles(owner_id);

-- Homes (with Phase 1B fields)
CREATE TABLE IF NOT EXISTS homes (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    circle_id VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    country VARCHAR(10) DEFAULT 'CA',
    region VARCHAR(100) DEFAULT '',
    city VARCHAR(100) DEFAULT '',
    postal_code VARCHAR(20) DEFAULT '',
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    house_type "HouseType" DEFAULT 'DETACHED',
    has_driveway BOOLEAN DEFAULT true,
    has_back_yard BOOLEAN DEFAULT true,
    has_back_alley BOOLEAN DEFAULT false,
    occupancy_pattern "OccupancyPattern" DEFAULT 'NORMAL',
    -- Phase 1B: House Mode fields
    house_mode "HouseMode" DEFAULT 'DISARMED',
    night_mode_auto BOOLEAN DEFAULT false,
    night_mode_start VARCHAR(5) DEFAULT '22:00',
    night_mode_end VARCHAR(5) DEFAULT '06:00',
    night_mode_high_only BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_homes_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
);

-- Circle Members
CREATE TABLE IF NOT EXISTS circle_members (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    circle_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    role "MemberRole" DEFAULT 'NEIGHBOR',
    display_name VARCHAR(255),
    notify_high BOOLEAN DEFAULT true,
    notify_medium BOOLEAN DEFAULT true,
    notify_low BOOLEAN DEFAULT false,
    can_view_media BOOLEAN DEFAULT true,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    CONSTRAINT fk_circle_members_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    CONSTRAINT fk_circle_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_circle_members UNIQUE (circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_circle_members_user ON circle_members(user_id);

-- Zones
CREATE TABLE IF NOT EXISTS zones (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    circle_id VARCHAR(255) NOT NULL,
    zone_type VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    zone_group VARCHAR(100) NOT NULL,
    icon VARCHAR(10) DEFAULT '📍',
    description TEXT,
    is_enabled BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    is_public_facing BOOLEAN DEFAULT false,
    is_high_value_area BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_zones_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    CONSTRAINT uq_zones_circle_type UNIQUE (circle_id, zone_type)
);
CREATE INDEX IF NOT EXISTS idx_zones_circle_enabled ON zones(circle_id, is_enabled);

-- Zone Type Configs
CREATE TABLE IF NOT EXISTS zone_type_configs (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    value VARCHAR(100) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    label_en VARCHAR(255) NOT NULL,
    zone_group VARCHAR(100) NOT NULL,
    icon VARCHAR(10) NOT NULL,
    description TEXT,
    description_en TEXT,
    supported_house_types TEXT[],
    default_enabled BOOLEAN DEFAULT false,
    is_public_facing BOOLEAN DEFAULT false,
    is_high_value_area BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0
);

-- Event Type Configs
CREATE TABLE IF NOT EXISTS event_type_configs (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    value VARCHAR(100) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    label_en VARCHAR(255) NOT NULL,
    icon VARCHAR(10) NOT NULL,
    severity "EventSeverity" DEFAULT 'MEDIUM',
    description TEXT,
    description_en TEXT,
    allowed_zones TEXT[],
    display_order INTEGER DEFAULT 0
);

-- ============================================================================
-- STEP 3: Create Phase 1B tables
-- ============================================================================

-- Integrations
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
CREATE INDEX IF NOT EXISTS idx_integrations_circle ON integrations(circle_id);
CREATE INDEX IF NOT EXISTS idx_integrations_webhook ON integrations(webhook_token);

-- Sensors
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
CREATE INDEX IF NOT EXISTS idx_sensors_circle ON sensors(circle_id);

-- ============================================================================
-- STEP 4: Create Events table (with Phase 1B fields)
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    circle_id VARCHAR(255) NOT NULL,
    zone_id VARCHAR(255) NOT NULL,
    creator_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    severity "EventSeverity" DEFAULT 'MEDIUM',
    status "EventStatus" DEFAULT 'OPEN',
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    occurred_end_at TIMESTAMP,
    police_reported BOOLEAN DEFAULT false,
    police_reported_at TIMESTAMP,
    police_report_number VARCHAR(100),
    loss_description TEXT,
    estimated_loss_amount DECIMAL(10, 2),
    -- Phase 1B fields
    source_type "EventSourceType" DEFAULT 'MANUAL',
    sensor_id VARCHAR(255),
    sensor_type "SensorType",
    external_event_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_events_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    CONSTRAINT fk_events_zone FOREIGN KEY (zone_id) REFERENCES zones(id),
    CONSTRAINT fk_events_creator FOREIGN KEY (creator_id) REFERENCES circle_members(id),
    CONSTRAINT fk_events_sensor FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);
CREATE INDEX IF NOT EXISTS idx_events_circle_created ON events(circle_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_circle_status ON events(circle_id, status);

-- Event Notes
CREATE TABLE IF NOT EXISTS event_notes (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    event_id VARCHAR(255) NOT NULL,
    author_id VARCHAR(255),
    note_type "NoteType" DEFAULT 'COMMENT',
    reaction_code VARCHAR(100),
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_notes_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_notes_author FOREIGN KEY (author_id) REFERENCES circle_members(id)
);
CREATE INDEX IF NOT EXISTS idx_event_notes_event_created ON event_notes(event_id, created_at);

-- Event Media
CREATE TABLE IF NOT EXISTS event_media (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    event_id VARCHAR(255) NOT NULL,
    note_id VARCHAR(255),
    uploader_id VARCHAR(255) NOT NULL,
    media_type "MediaType" NOT NULL,
    source_type "MediaSourceType" DEFAULT 'USER_UPLOAD',
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    duration_sec INTEGER,
    original_file_hash VARCHAR(255),
    original_created_at TIMESTAMP,
    device_info VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_media_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_media_note FOREIGN KEY (note_id) REFERENCES event_notes(id),
    CONSTRAINT fk_event_media_uploader FOREIGN KEY (uploader_id) REFERENCES circle_members(id)
);
CREATE INDEX IF NOT EXISTS idx_event_media_event ON event_media(event_id);

-- ============================================================================
-- STEP 5: Create updated_at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_device_tokens_updated_at ON device_tokens;
CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON device_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_circles_updated_at ON circles;
CREATE TRIGGER update_circles_updated_at BEFORE UPDATE ON circles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_homes_updated_at ON homes;
CREATE TRIGGER update_homes_updated_at BEFORE UPDATE ON homes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_circle_members_updated_at ON circle_members;
CREATE TRIGGER update_circle_members_updated_at BEFORE UPDATE ON circle_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_zones_updated_at ON zones;
CREATE TRIGGER update_zones_updated_at BEFORE UPDATE ON zones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sensors_updated_at ON sensors;
CREATE TRIGGER update_sensors_updated_at BEFORE UPDATE ON sensors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Database initialization complete!
-- ============================================================================
