-- ============================================================================
-- ReturnRide: Cancellation Audit & Reliability System Schema
-- Adds structured tracking, graduated consequences, and emergency appeals
-- ============================================================================

-- 1. CANCELLATION EVENTS AUDIT TABLE
CREATE TABLE IF NOT EXISTS cancellation_events (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    booking_id VARCHAR(64) REFERENCES booking_requests(id) ON DELETE SET NULL,
    ride_id VARCHAR(64) NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    user_role VARCHAR(32) NOT NULL CHECK (user_role IN ('PASSENGER', 'DRIVER', 'ADMIN')),
    category VARCHAR(64) NOT NULL CHECK (
        category IN (
            'PASSENGER_VOLUNTARY',
            'DRIVER_SEAT_CANCEL',
            'DRIVER_RIDE_CANCEL',
            'AUTO_CONFLICT_REJECT',
            'SYSTEM_EXPIRED',
            'FORCE_ADMIN'
        )
    ),
    reason TEXT NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hours_before_departure NUMERIC(6, 2) NOT NULL,
    timing_risk VARCHAR(32) NOT NULL CHECK (
        timing_risk IN ('STANDARD', 'MODERATE', 'LAST_MINUTE', 'PAST_DEPARTURE')
    ),
    is_emergency BOOLEAN NOT NULL DEFAULT false,
    emergency_category VARCHAR(64) CHECK (
        emergency_category IS NULL OR
        emergency_category IN ('MEDICAL', 'VEHICLE_BREAKDOWN', 'ROAD_BLOCK_WEATHER', 'FAMILY_EMERGENCY', 'OTHER')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for rolling-window queries
CREATE INDEX IF NOT EXISTS idx_cancellation_events_user_time 
ON cancellation_events(user_id, cancelled_at DESC);

-- 2. EMERGENCY APPEALS TABLE
CREATE TABLE IF NOT EXISTS cancellation_appeals (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    cancellation_event_id VARCHAR(64) NOT NULL REFERENCES cancellation_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    emergency_category VARCHAR(64) NOT NULL CHECK (
        emergency_category IN ('MEDICAL', 'VEHICLE_BREAKDOWN', 'ROAD_BLOCK_WEATHER', 'FAMILY_EMERGENCY', 'OTHER')
    ),
    statement TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES user_profiles(id),
    admin_feedback TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeals_status_time 
ON cancellation_appeals(status, submitted_at DESC);

-- 3. USER PROFILE RELIABILITY COLUMNS
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS reliability_score INTEGER NOT NULL DEFAULT 100 CHECK (reliability_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS reliability_tier VARCHAR(32) NOT NULL DEFAULT 'EXCELLENT',
ADD COLUMN IF NOT EXISTS restriction_level VARCHAR(32) NOT NULL DEFAULT 'NORMAL' CHECK (restriction_level IN ('NORMAL', 'WARNING_ISSUED', 'TEMPORARY_RESTRICTION', 'FLAGGED_FOR_MANUAL_REVIEW')),
ADD COLUMN IF NOT EXISTS restricted_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS restriction_reason TEXT,
ADD COLUMN IF NOT EXISTS total_completed_rides INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cancellations INTEGER NOT NULL DEFAULT 0;

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE cancellation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own cancellation events" ON cancellation_events;
CREATE POLICY "Users can view their own cancellation events"
ON cancellation_events FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert their cancellation events" ON cancellation_events;
CREATE POLICY "Users can insert their cancellation events"
ON cancellation_events FOR INSERT
TO anon, authenticated
WITH CHECK (true);

ALTER TABLE cancellation_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view appeals" ON cancellation_appeals;
CREATE POLICY "Users can view appeals"
ON cancellation_appeals FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert appeals" ON cancellation_appeals;
CREATE POLICY "Users can insert appeals"
ON cancellation_appeals FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update appeals" ON cancellation_appeals;
CREATE POLICY "Admins can update appeals"
ON cancellation_appeals FOR UPDATE
TO anon, authenticated
USING (true);
