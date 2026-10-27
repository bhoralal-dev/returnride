-- ============================================================================
-- ReturnRide: Initial Database Schema & Atomic Concurrency Migration
-- Target: Supabase / PostgreSQL 15+
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. LOCATIONS TABLE (Nationwide Pakistan Dynamic Registry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    province VARCHAR(64) NOT NULL,
    district VARCHAR(128),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Initial Nationwide Cities & Rural Hubs
INSERT INTO locations (id, name, province, district) VALUES
    ('loc-uk', 'Umerkot', 'Sindh', 'Umerkot'),
    ('loc-khi', 'Karachi', 'Sindh', 'Karachi'),
    ('loc-hyd', 'Hyderabad', 'Sindh', 'Hyderabad'),
    ('loc-suk', 'Sukkur', 'Sindh', 'Sukkur'),
    ('loc-mpk', 'Mirpur Khas', 'Sindh', 'Mirpur Khas'),
    ('loc-lhr', 'Lahore', 'Punjab', 'Lahore'),
    ('loc-isb', 'Islamabad / Rawalpindi', 'Federal / Punjab', 'Islamabad'),
    ('loc-mul', 'Multan', 'Punjab', 'Multan'),
    ('loc-fsd', 'Faisalabad', 'Punjab', 'Faisalabad'),
    ('loc-pes', 'Peshawar', 'KPK', 'Peshawar'),
    ('loc-qta', 'Quetta', 'Balochistan', 'Quetta')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. USERS & PROFILES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'PASSENGER' CHECK (role IN ('PASSENGER', 'DRIVER', 'ADMIN')),
    is_phone_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. DRIVER PROFILES (Identity, CNIC & Verification)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_profiles (
    user_id UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
    cnic_number VARCHAR(15) UNIQUE NOT NULL, -- Format: 44101-xxxxxxx-x
    license_number VARCHAR(64) NOT NULL,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' 
        CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')),
    rejection_reason TEXT,
    verified_at TIMESTAMPTZ,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 5.0,
    total_completed_rides INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. VEHICLES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    driver_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    make VARCHAR(64) NOT NULL, -- e.g. Toyota
    model VARCHAR(64) NOT NULL, -- e.g. Corolla
    year INTEGER NOT NULL,
    license_plate VARCHAR(32) NOT NULL,
    color VARCHAR(32) NOT NULL,
    passenger_capacity INTEGER NOT NULL CHECK (passenger_capacity BETWEEN 1 AND 10),
    has_ac BOOLEAN NOT NULL DEFAULT true,
    has_trunk_space BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. RIDES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rides (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    driver_id UUID NOT NULL REFERENCES user_profiles(id),
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id),
    origin_location_id VARCHAR(64) NOT NULL REFERENCES locations(id),
    destination_location_id VARCHAR(64) NOT NULL REFERENCES locations(id),
    departure_time TIMESTAMPTZ NOT NULL,
    booking_mode VARCHAR(32) NOT NULL DEFAULT 'WHOLE_CAR_OR_SEATS'
        CHECK (booking_mode IN ('WHOLE_CAR', 'SEATS', 'WHOLE_CAR_OR_SEATS')),
    capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 10),
    booked_seats_count INTEGER NOT NULL DEFAULT 0 CHECK (booked_seats_count <= capacity),
    whole_car_price NUMERIC(10, 2) NOT NULL CHECK (whole_car_price > 0),
    seat_price NUMERIC(10, 2) CHECK (seat_price IS NULL OR seat_price > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED'
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'SEATS_FILLED', 'FULL_CAR_BOOKED', 'DEPARTED', 'COMPLETED', 'CANCELLED')),
    auto_reopen_on_cancellation BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. BOOKING REQUESTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_requests (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    ride_id VARCHAR(64) NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES user_profiles(id),
    booking_type VARCHAR(32) NOT NULL CHECK (booking_type IN ('WHOLE_CAR', 'SEAT')),
    requested_seats INTEGER NOT NULL CHECK (requested_seats >= 1),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED_BY_DRIVER', 'REJECTED_AUTO_CONFLICT', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER')),
    rejection_reason TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. CANCELLATION RECORDS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cancellation_records (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    booking_id VARCHAR(64) NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
    ride_id VARCHAR(64) NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    cancelled_by VARCHAR(32) NOT NULL CHECK (cancelled_by IN ('PASSENGER', 'DRIVER', 'ADMIN')),
    reason TEXT NOT NULL,
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. ATOMIC STORED PROCEDURE: ACCEPT BOOKING WITH ROW LOCKS (Zero Race Conditions)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_booking_request_tx(
    p_ride_id VARCHAR(64),
    p_request_id VARCHAR(64),
    p_driver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_ride rides%ROWTYPE;
    v_req booking_requests%ROWTYPE;
    v_available_seats INTEGER;
    v_new_booked INTEGER;
    v_new_status VARCHAR(32);
    v_conflict_count INTEGER := 0;
BEGIN
    -- 1. Lock target ride row exclusively for update
    SELECT * INTO v_ride
    FROM rides
    WHERE id = p_ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RIDE_NOT_FOUND: Ride does not exist';
    END IF;

    -- 2. Verify driver ownership
    IF v_ride.driver_id <> p_driver_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED_DRIVER: Driver does not own this ride';
    END IF;

    -- 3. Verify ride is published
    IF v_ride.status <> 'PUBLISHED' THEN
        RAISE EXCEPTION 'RIDE_INACTIVE: Ride is not currently published for bookings';
    END IF;

    -- 4. Lock and fetch target booking request
    SELECT * INTO v_req
    FROM booking_requests
    WHERE id = p_request_id AND ride_id = p_ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'REQUEST_NOT_FOUND: Booking request not found';
    END IF;

    IF v_req.status <> 'PENDING' THEN
        RAISE EXCEPTION 'REQUEST_NOT_PENDING: Request is already %', v_req.status;
    END IF;

    v_available_seats := v_ride.capacity - v_ride.booked_seats_count;

    -- 5. Handle Whole-Car Booking
    IF v_req.booking_type = 'WHOLE_CAR' THEN
        IF v_ride.booked_seats_count > 0 THEN
            RAISE EXCEPTION 'CONFLICT_SEATS_ALREADY_CONFIRMED: Cannot accept whole car when individual seats are booked';
        END IF;

        v_new_booked := v_ride.capacity;
        v_new_status := 'FULL_CAR_BOOKED';

        -- Update ride
        UPDATE rides
        SET booked_seats_count = v_new_booked,
            status = v_new_status,
            updated_at = NOW()
        WHERE id = p_ride_id;

        -- Accept target request
        UPDATE booking_requests
        SET status = 'ACCEPTED',
            updated_at = NOW()
        WHERE id = p_request_id;

        -- Auto-reject ALL other pending requests for this ride
        UPDATE booking_requests
        SET status = 'REJECTED_AUTO_CONFLICT',
            rejection_reason = 'Ride was reserved as a whole car by another passenger.',
            updated_at = NOW()
        WHERE ride_id = p_ride_id AND id <> p_request_id AND status = 'PENDING';

        GET DIAGNOSTICS v_conflict_count = ROW_COUNT;

    -- 6. Handle Seat Booking
    ELSE
        IF v_req.requested_seats > v_available_seats THEN
            RAISE EXCEPTION 'INSUFFICIENT_SEATS: Requested % seats but only % remain', v_req.requested_seats, v_available_seats;
        END IF;

        v_new_booked := v_ride.booked_seats_count + v_req.requested_seats;
        IF v_new_booked = v_ride.capacity THEN
            v_new_status := 'SEATS_FILLED';
        ELSE
            v_new_status := 'PUBLISHED';
        END IF;

        -- Update ride
        UPDATE rides
        SET booked_seats_count = v_new_booked,
            status = v_new_status,
            updated_at = NOW()
        WHERE id = p_ride_id;

        -- Accept target request
        UPDATE booking_requests
        SET status = 'ACCEPTED',
            updated_at = NOW()
        WHERE id = p_request_id;

        -- Auto-reject any pending WHOLE_CAR requests and any pending SEAT requests that now exceed remaining seats
        UPDATE booking_requests
        SET status = 'REJECTED_AUTO_CONFLICT',
            rejection_reason = CASE 
                WHEN booking_type = 'WHOLE_CAR' THEN 'Whole-car booking unavailable after individual seats were booked.'
                ELSE 'Requested seats exceed remaining vehicle capacity.'
            END,
            updated_at = NOW()
        WHERE ride_id = p_ride_id 
          AND id <> p_request_id 
          AND status = 'PENDING'
          AND (booking_type = 'WHOLE_CAR' OR requested_seats > (v_ride.capacity - v_new_booked));

        GET DIAGNOSTICS v_conflict_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'ride_id', p_ride_id,
        'accepted_request_id', p_request_id,
        'new_booked_seats', v_new_booked,
        'new_ride_status', v_new_status,
        'auto_rejected_conflicts', v_conflict_count
    );
END;
$$;
